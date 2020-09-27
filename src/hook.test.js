const test = require('tape');
const hook = require('./hook');

test('Hook basics', t => {
  t.plan(1);

  t.equal(typeof hook, 'function', 'hook is a function');
});

test('Hook calls', async t => {
  t.plan(4);

  const syncQueue = [
    data => data.toUpperCase(),
  ];
  const asyncQueue = [
    data => new Promise(r => setTimeout(() => r(data.toUpperCase()), 10)),
  ];

  t.equal(await hook(undefined , 'abcd'), 'abcd', 'Hook returns original data on undefined queue');
  t.equal(await hook([]        , 'efgh'), 'efgh', 'Hook returns original data on empty queue');
  t.equal(await hook(syncQueue , 'ijkl'), 'IJKL', 'Hook returns transformed data on sync queue');
  t.equal(await hook(asyncQueue, 'mnop'), 'MNOP', 'Hook returns transformed data on async queue');
});
