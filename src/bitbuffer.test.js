const test       = require('tape');
const BitBuffer  = require('./bitbuffer');

test('BitBuffer basics', t => {
  t.plan(3);

  t.equal(typeof BitBuffer, 'function', 'BitBuffer is a function/class');

  let bitbuf = new BitBuffer();
  t.ok(bitbuf instanceof BitBuffer, 'BitBuffer can be used as constructor');

  bitbuf = new BitBuffer(12);
  t.equal(bitbuf.length, 12, 'Length can be given to constructor');

});

test('BitBuffer slice', t => {
  t.plan(4);

  let bitbuf = new BitBuffer(12).slice();
  t.ok(bitbuf instanceof BitBuffer, 'Slice returns a bitbuffer as well');

  t.equal(bitbuf.slice(10).length, 2, 'Slice start functions');
  t.equal(bitbuf.slice(0,5).length, 5, 'Slice end functions');
  t.equal(bitbuf.slice(2,5).length, 3, 'Slice start+end functions');
});

test('BitBuffer from Buffer', t => {
  t.plan(1);

  let buf    = Buffer.alloc(12).map((a,i) => i);
  let bitbuf = BitBuffer.fromBuffer(buf);

  t.equal(bitbuf.length, buf.length * 8, 'BitBuffer is 8 times as long');
});

test('BitBuffer shifting uint', t => {
  t.plan(6);

  let buf    = Buffer.alloc(12).map((a,i) => i);
  let bitbuf = BitBuffer.fromBuffer(buf);

  // Verify converted into uint16be
  for(let i=0; i<6; i++) {
    t.equal(bitbuf.shiftUint(16), (((i*2)<<8) + ((i*2)+1)), 'Verifying 16 bits: ' + (((i*2)<<8) + ((i*2)+1)) );
  }
});

test('BitBuffer appending reversed bits', t => {
  t.plan(4);

  let buf    = Buffer.from([0b11001010, 0b10010110]);
  let bitbuf = BitBuffer.fromBuffer(buf);

  // extract 4
  let firstNybble = bitbuf.splice(0,4);
  t.ok(firstNybble instanceof BitBuffer, 'splice returns instance as well');
  t.deepEqual([...firstNybble], [1,1,0,0], 'extracted bits match entered number\'s bits');

  // Let's reverse everything
  firstNybble.reverse();
  t.deepEqual([...firstNybble], [0,0,1,1], 'reversed bits still match');


  // Append & test whole result
  bitbuf.push(...firstNybble);
  t.deepEqual([...bitbuf], [1,0,1,0,1,0,0,1,0,1,1,0,0,0,1,1], 'appended result is correct');
});

test('BitBuffer toBuffer', t => {
  t.plan(2);

  let buf       = Buffer.from([0xDE,0xAD,0xBE,0xEF]);
  let bitbuf    = BitBuffer.fromBuffer(buf);
  let bitbufdup = BitBuffer.fromBuffer(buf);
  let rebuf     = bitbuf.toBuffer();

  t.deepEqual(buf   , rebuf    , 'toBuffer matches the original buffer');
  t.deepEqual(bitbuf, bitbufdup, 'toBuffer was non-destructive');
});
