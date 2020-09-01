const test       = require('tape');
const Peer       = require('./peer');
const Connection = require('../mock/simple-peer');

function connectPeers(peerA, peerB, Adelay = 0, Bdelay = 0) {
  const conn = Connection(Adelay, Bdelay);
  peerA.addConnection(conn[0]);
  peerB.addConnection(conn[1]);
}

test('Peer basics', t => {
  t.plan(3);

  t.equal('function', typeof Peer, 'Peer is a function');

  const peer = new Peer();
  t.equal('object', typeof peer, 'Peer can be used as constructor');

  t.equal('function', typeof peer.shutdown, 'Peer has shutdown function');
  peer.shutdown();
});

test('Remote ID detection', async t => {
  t.plan(6);
  const peerOptions = { interval: 100 };

  // Setup peers
  const peer = [
    new Peer(peerOptions),
    new Peer(peerOptions),
    new Peer(peerOptions),
  ];

  // Setup connections
  connectPeers(peer[0], peer[1]);
  connectPeers(peer[1], peer[2]);
  connectPeers(peer[2], peer[0]);

  // Let the network settle
  await new Promise(r => setTimeout(r, peerOptions.interval * 3));

  // Check if the IDs were detected correctly
  t.deepEqual(peer[0].connections[0].id, peer[1].id, 'Peer A detected B\'s id');
  t.deepEqual(peer[0].connections[1].id, peer[2].id, 'Peer A detected C\'s id');
  t.deepEqual(peer[1].connections[0].id, peer[0].id, 'Peer B detected A\'s id');
  t.deepEqual(peer[1].connections[1].id, peer[2].id, 'Peer B detected C\'s id');
  t.deepEqual(peer[2].connections[1].id, peer[0].id, 'Peer C detected A\'s id');
  t.deepEqual(peer[2].connections[0].id, peer[1].id, 'Peer C detected B\'s id');

  // Shutdown peers
  peer[0].shutdown();
  peer[1].shutdown();
  peer[2].shutdown();
});

test('Path finding', async t => {
  t.plan(20);
  const peerOptions = { interval: 100 };

  // Setup peers
  const peer = [
    new Peer(peerOptions),
    new Peer(peerOptions),
    new Peer(peerOptions),
    new Peer(peerOptions),
    new Peer(peerOptions),
  ];

  // Setup connections
  connectPeers(peer[0], peer[1],  10,  10);
  connectPeers(peer[1], peer[2],  20,  20);
  connectPeers(peer[2], peer[0],  50,  50);
  connectPeers(peer[2], peer[3], 100, 100);
  connectPeers(peer[3], peer[4], 200, 200);

  // Let the network settle
  await new Promise(r => setTimeout(r, peerOptions.interval * 5));

  // Test path resolve
  // Some take a longer route with faster connection
  let found;
  found = await peer[0]._findPeer(peer[1].id); t.equal(found.routeLabel, ''            , 'Peer A is directly connected to peer B');
  found = await peer[0]._findPeer(peer[2].id); t.equal(found.routeLabel, '0010'        , 'Peer A can route to peer C');
  found = await peer[0]._findPeer(peer[3].id); t.equal(found.routeLabel, '00100011'    , 'Peer A can route to peer D');
  found = await peer[0]._findPeer(peer[4].id); t.equal(found.routeLabel, '001000110010', 'Peer A can route to peer E');
  found = await peer[1]._findPeer(peer[0].id); t.equal(found.routeLabel, ''            , 'Peer B is directly connected to peer A');
  found = await peer[1]._findPeer(peer[2].id); t.equal(found.routeLabel, ''            , 'Peer B is directly connected to peer C');
  found = await peer[1]._findPeer(peer[3].id); t.equal(found.routeLabel, '0011'        , 'Peer B can route to peer D');
  found = await peer[1]._findPeer(peer[4].id); t.equal(found.routeLabel, '00110010'    , 'Peer B can route to peer E');
  found = await peer[2]._findPeer(peer[0].id); t.equal(found.routeLabel, '0001'        , 'Peer C can route to peer A');
  found = await peer[2]._findPeer(peer[1].id); t.equal(found.routeLabel, ''            , 'Peer C is directly connected to peer B');
  found = await peer[2]._findPeer(peer[3].id); t.equal(found.routeLabel, ''            , 'Peer C is directly connected to peer D');
  found = await peer[2]._findPeer(peer[4].id); t.equal(found.routeLabel, '0010'        , 'Peer C can route to peer E');
  found = await peer[3]._findPeer(peer[0].id); t.equal(found.routeLabel, '00010001'    , 'Peer D can route to peer A');
  found = await peer[3]._findPeer(peer[1].id); t.equal(found.routeLabel, '0001'        , 'Peer D can route to peer B');
  found = await peer[3]._findPeer(peer[2].id); t.equal(found.routeLabel, ''            , 'Peer D is directly connected to peer C');
  found = await peer[3]._findPeer(peer[4].id); t.equal(found.routeLabel, ''            , 'Peer D is directly connected to peer E');
  found = await peer[4]._findPeer(peer[0].id); t.equal(found.routeLabel, '000100010001', 'Peer E can route to peer A');
  found = await peer[4]._findPeer(peer[1].id); t.equal(found.routeLabel, '00010001'    , 'Peer E can route to peer B');
  found = await peer[4]._findPeer(peer[2].id); t.equal(found.routeLabel, '0001'        , 'Peer E can route to peer C');
  found = await peer[4]._findPeer(peer[3].id); t.equal(found.routeLabel, ''            , 'Peer E is directly connected to peer D');

  // Shutdown peers
  for(const p of peer) {
    p.shutdown();
  }
});

test('Path finding timeout', async t => {
  t.plan(12);
  const peerOptions = { interval: 1000, timeout: 700 };

  // Setup peers
  const peer = [
    new Peer(peerOptions),
    new Peer(peerOptions),
    new Peer(peerOptions),
    new Peer(peerOptions),
  ];

  // Connect peers over slow connections
  connectPeers(peer[0], peer[1], 200, 200);
  connectPeers(peer[1], peer[2], 200, 200);
  connectPeers(peer[2], peer[3], 200, 200);

  // Let the network settle
  await new Promise(r => setTimeout(r, peerOptions.interval * 3));

  // The actual tests
  let found;
  found = await peer[0]._findPeer(peer[1].id); t.ok(found, 'Peer A can find peer B');
  found = await peer[0]._findPeer(peer[2].id); t.ok(found, 'Peer A can find peer C');
  found = await peer[0]._findPeer(peer[3].id); t.notOk(found, 'Peer A can not find peer D');
  found = await peer[1]._findPeer(peer[0].id); t.ok(found, 'Peer B can find peer A');
  found = await peer[1]._findPeer(peer[2].id); t.ok(found, 'Peer B can find peer C');
  found = await peer[1]._findPeer(peer[3].id); t.ok(found, 'Peer B can find peer D');
  found = await peer[2]._findPeer(peer[0].id); t.ok(found, 'Peer C can find peer A');
  found = await peer[2]._findPeer(peer[1].id); t.ok(found, 'Peer C can find peer B');
  found = await peer[2]._findPeer(peer[3].id); t.ok(found, 'Peer C can find peer D');
  found = await peer[3]._findPeer(peer[0].id); t.notOk(found, 'Peer D can not find peer A');
  found = await peer[3]._findPeer(peer[1].id); t.ok(found, 'Peer D can find peer B');
  found = await peer[3]._findPeer(peer[2].id); t.ok(found, 'Peer D can find peer C');

  // Shutdown peers
  for(const p of peer) {
    p.shutdown();
  }
});
