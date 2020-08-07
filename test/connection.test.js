const test         = require('tape');
const connection   = require('./connection');
const EventEmitter = require('events').EventEmitter;

test('Validating connection mock', t => {
  t.plan(13);

  // Check init
  t.equal('function', typeof connection, 'It\'s a function');
  const conn = connection();
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
  let Aopen = true;
  let Bopen = true;
  conn[0].on('close', () => Aopen = false);
  conn[1].on('close', () => Bopen = false);

  // Transmit data back-and-forth
  conn[0].send('Atx');
  conn[1].send('Btx');

  // Check if everything was received correctly
  t.equal(Arx, 'Btx', 'A received what B sent');
  t.equal(Brx, 'Atx', 'B received what A sent');

  // Check if destroying the connection works
  conn[0].destroy();
  t.equal(Aopen, false, 'A triggered \'close\' event on A.destroy');
  t.equal(Bopen, false, 'B triggered \'close\' event on A.destroy');
  t.equal('closed', conn[0].status, 'A claims to be closed');
  t.equal('closed', conn[1].status, 'B claims to be closed');
});
