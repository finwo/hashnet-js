const test  = require('tape');
const index = require('./index');

test('index responses', t => {
  t.plan(2);

  t.equal(index.Client, require('./client'), 'Client matches');
  t.equal(index.Server, require('./server'), 'Server matches');
});
