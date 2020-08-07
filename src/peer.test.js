const test       = require('tape');
const Peer       = require('./peer');
const Connection = require('../test/connection');

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
