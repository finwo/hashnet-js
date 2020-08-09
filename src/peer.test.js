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
  const connection = [
    Connection(),
    Connection(),
    Connection(),
  ];

  // Wait for peers to be ready
  await Promise.all(peer.map(p => p._ready));

  // Attach peers together
  // peer[0] <--> peer[1]
  peer[0].addConnection(connection[0][0]);
  peer[1].addConnection(connection[0][1]);
  // peer[1] <--> peer[2]
  peer[1].addConnection(connection[1][0]);
  peer[2].addConnection(connection[1][1]);
  // peer[2] <--> peer[0]
  peer[2].addConnection(connection[2][0]);
  peer[0].addConnection(connection[2][1]);

  // Let the network settle
  await new Promise(r => setTimeout(r, peerOptions.interval * 3));

  // Check if the IDs were detected correctly
  t.deepEqual(connection[0][0].id, peer[1].id, 'Peer A detected B\'s id');
  t.deepEqual(connection[2][1].id, peer[2].id, 'Peer A detected C\'s id');
  t.deepEqual(connection[0][1].id, peer[0].id, 'Peer B detected A\'s id');
  t.deepEqual(connection[1][0].id, peer[2].id, 'Peer B detected C\'s id');
  t.deepEqual(connection[2][0].id, peer[0].id, 'Peer C detected A\'s id');
  t.deepEqual(connection[1][1].id, peer[1].id, 'Peer C detected B\'s id');

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

  // Wait for peers to be ready
  await Promise.all(peer.map(p => p._ready));

  // Setup connections
  connectPeers(peer[0], peer[1],  1,  2);
  connectPeers(peer[1], peer[2], 13, 14);
  connectPeers(peer[2], peer[0],  1,  1);
  connectPeers(peer[2], peer[3],  2,  1);
  connectPeers(peer[3], peer[4],  5,  5);

  // Let the network settle
  await new Promise(r => setTimeout(r, peerOptions.interval * 3));

  // Test path resolve
  let found;
  found = await peer[0]._findPeer(peer[1].id); t.equal(found.routeLabel, ''        , 'Peer A is directly connected to peer B');
  found = await peer[0]._findPeer(peer[2].id); t.equal(found.routeLabel, ''        , 'Peer A is directly connected to peer C');
  found = await peer[0]._findPeer(peer[3].id); t.equal(found.routeLabel, '0011'    , 'Peer A can route to peer D');
  found = await peer[0]._findPeer(peer[4].id); t.equal(found.routeLabel, '00110010', 'Peer A can route to peer E');
  found = await peer[1]._findPeer(peer[0].id); t.equal(found.routeLabel, ''        , 'Peer B is directly connected to peer A');
  found = await peer[1]._findPeer(peer[2].id); t.equal(found.routeLabel, ''        , 'Peer B is directly connected to peer C');
  found = await peer[1]._findPeer(peer[3].id); t.equal(found.routeLabel, '0011'    , 'Peer B can route to peer D');
  found = await peer[1]._findPeer(peer[4].id); t.equal(found.routeLabel, '00110010', 'Peer B can route to peer E');
  found = await peer[2]._findPeer(peer[0].id); t.equal(found.routeLabel, ''        , 'Peer C is directly connected to peer A');
  found = await peer[2]._findPeer(peer[1].id); t.equal(found.routeLabel, ''        , 'Peer C is directly connected to peer B');
  found = await peer[2]._findPeer(peer[3].id); t.equal(found.routeLabel, ''        , 'Peer C is directly connected to peer D');
  found = await peer[2]._findPeer(peer[4].id); t.equal(found.routeLabel, '0010'    , 'Peer C can route to peer E');
  found = await peer[3]._findPeer(peer[0].id); t.equal(found.routeLabel, '0010'    , 'Peer D can route to peer A');
  found = await peer[3]._findPeer(peer[1].id); t.equal(found.routeLabel, '0001'    , 'Peer D can route to peer B');
  found = await peer[3]._findPeer(peer[2].id); t.equal(found.routeLabel, ''        , 'Peer D is directly connected to peer C');
  found = await peer[3]._findPeer(peer[4].id); t.equal(found.routeLabel, ''        , 'Peer D is directly connected to peer E');
  found = await peer[4]._findPeer(peer[0].id); t.equal(found.routeLabel, '00010010', 'Peer E can route to peer A');
  found = await peer[4]._findPeer(peer[1].id); t.equal(found.routeLabel, '00010001', 'Peer E can route to peer B');
  found = await peer[4]._findPeer(peer[2].id); t.equal(found.routeLabel, '0001'    , 'Peer E can route to peer C');
  found = await peer[4]._findPeer(peer[3].id); t.equal(found.routeLabel, ''        , 'Peer E is directly connected to peer D');

  // Shutdown peers
  for(const p of peer) {
    p.shutdown();
  }
});
