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
  t.equal(connection[0][0].id, peer[1].id, 'Peer A detected B\'s id');
  t.equal(connection[2][1].id, peer[2].id, 'Peer A detected C\'s id');
  t.equal(connection[0][1].id, peer[0].id, 'Peer B detected A\'s id');
  t.equal(connection[1][0].id, peer[2].id, 'Peer B detected C\'s id');
  t.equal(connection[2][0].id, peer[0].id, 'Peer C detected A\'s id');
  t.equal(connection[1][1].id, peer[1].id, 'Peer C detected B\'s id');

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
  connectPeers(peer[0], peer[1],  1,  2);
  connectPeers(peer[1], peer[2], 13, 14);
  connectPeers(peer[2], peer[0],  1,  1);
  connectPeers(peer[2], peer[3],  2,  1);
  connectPeers(peer[3], peer[4],  5,  5);

  // Let the network settle
  await new Promise(r => setTimeout(r, peerOptions.interval * 3));

  // Test path resolve
  t.deepEqual(await peer[0]._findPath(peer[1].id), [0], 'Peer A to peer B is [0]');
  t.deepEqual(await peer[0]._findPath(peer[2].id), [1], 'Peer A to peer C is [1]');
  t.deepEqual(await peer[0]._findPath(peer[3].id), [1,2], 'Peer A to peer D is [1,2]');
  t.deepEqual(await peer[0]._findPath(peer[4].id), [1,2,1], 'Peer A to peer E is [1,2,1]');
  t.deepEqual(await peer[1]._findPath(peer[0].id), [0], 'Peer B to peer A is [0]');
  t.deepEqual(await peer[1]._findPath(peer[2].id), [1], 'Peer B to peer C is [1]');
  t.deepEqual(await peer[1]._findPath(peer[3].id), [1,2], 'Peer B to peer D is [1,2]');
  t.deepEqual(await peer[1]._findPath(peer[4].id), [1,2,1], 'Peer B to peer E is [1,2,1]');
  t.deepEqual(await peer[2]._findPath(peer[0].id), [1], 'Peer C to peer A is [1]');
  t.deepEqual(await peer[2]._findPath(peer[1].id), [0], 'Peer C to peer B is [0]');
  t.deepEqual(await peer[2]._findPath(peer[3].id), [2], 'Peer C to peer D is [2]');
  t.deepEqual(await peer[2]._findPath(peer[4].id), [2,1], 'Peer C to peer E is [2,1]');
  t.deepEqual(await peer[3]._findPath(peer[0].id), [0,1], 'Peer D to peer A is [0,1]');
  t.deepEqual(await peer[3]._findPath(peer[1].id), [0,0], 'Peer D to peer B is [0,0]');
  t.deepEqual(await peer[3]._findPath(peer[2].id), [0], 'Peer D to peer C is [0]');
  t.deepEqual(await peer[3]._findPath(peer[4].id), [1], 'Peer D to peer E is [1]');
  t.deepEqual(await peer[4]._findPath(peer[0].id), [0,0,1], 'Peer E to peer A is [0,0,1]');
  t.deepEqual(await peer[4]._findPath(peer[1].id), [0,0,0], 'Peer E to peer B is [0,0,0]');
  t.deepEqual(await peer[4]._findPath(peer[2].id), [0,0], 'Peer E to peer C is [0,0]');
  t.deepEqual(await peer[4]._findPath(peer[3].id), [0], 'Peer E to peer D is [0]');

  // Shutdown peers
  for(const p of peer) {
    p.shutdown();
  }
});
