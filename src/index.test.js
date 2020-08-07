const test  = require('tape');
const index = require('./index');

test('index responses', t => {
  t.plan(1);

  t.equal(index.Peer, require('./peer'), 'Peer matches');
});
