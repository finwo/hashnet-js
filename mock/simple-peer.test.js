const test         = require('tape');
const connection   = require('./simple-peer');
const EventEmitter = require('events').EventEmitter;

test('Validating connection mock', async t => {
  t.plan(17);

  // Check init
  t.equal('function', typeof connection, 'It\'s a function');
  const conn        = connection();
  const delayedConn = connection(2,5);
  t.equal(true, Array.isArray(conn), 'Init returns an array');
  t.equal(2, conn.length, 'New connection array.length = 2');

  // Check if we can listen for events
  t.equal(true, conn[0] instanceof EventEmitter, 'A end is an EventEmitter');
  t.equal(true, conn[1] instanceof EventEmitter, 'B end is an EventEmitter');

  // Check connection status
  t.equal('connected', conn[0].status, 'A claims to be connected');
  t.equal('connected', conn[1].status, 'B claims to be connected');

  // Setup listeners
  let Arx = null;
  let Brx = null;
  conn[0].on('data', (data) => Arx = data);
  conn[1].on('data', (data) => Brx = data);
  delayedConn[0].on('data', (data) => Arx = data);
  delayedConn[1].on('data', (data) => Brx = data);
  let Aopen = true;
  let Bopen = true;
  conn[0].on('close', () => Aopen = false);
  conn[1].on('close', () => Bopen = false);
  delayedConn[0].on('close', () => Aopen = false);
  delayedConn[1].on('close', () => Bopen = false);

  // Transmit data back-and-forth
  conn[0].send('Atx');
  conn[1].send('Btx');

  // Let the connection settle
  await new Promise(r => setTimeout(r,0));

  // Check if everything was received correctly
  t.equal(Arx, 'Btx', 'A received what B sent');
  t.equal(Brx, 'Atx', 'B received what A sent');

  // Check if destroying the connection works
  conn[0].destroy();
  t.equal(Aopen, false, 'A triggered \'close\' event on A.destroy');
  t.equal(Bopen, false, 'B triggered \'close\' event on A.destroy');
  t.equal('closed', conn[0].status, 'A claims to be closed');
  t.equal('closed', conn[1].status, 'B claims to be closed');

  // Reset some statuses
  Arx = null;
  Brx = null;
  Aopen = true;
  Bopen = true;

  // Transmit data back-and-forth
  delayedConn[0].send('Atx');
  delayedConn[1].send('Btx');

  // Check if everything wasn't received yet
  t.equal(Arx, null, 'Delayed Btx not received yet');
  t.equal(Brx, null, 'Delayed Atx not received yet');

  // Let the connection settle
  await new Promise(r => setTimeout(r,10));

  // Check if everything was received correctly
  t.equal(Arx, 'Btx', 'A received what B sent');
  t.equal(Brx, 'Atx', 'B received what A sent');

  // Close remainders
  delayedConn[0].destroy();
});
