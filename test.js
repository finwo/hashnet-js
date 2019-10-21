const Hashnet = require('./index');

let Alice = new Hashnet.KeyPair();
console.log('Alice', Alice);

let Bob   = new Hashnet.KeyPair();
console.log('Bob'  , Bob);

// Key alice sends with
let AliceTx = new Hashnet.KeyPair({
  n: Bob.n,
  s: Alice.s
});
console.log('AliceTx', AliceTx);

let AliceTxSecret = AliceTx.sharedSecret(Bob);
console.log('AliceTxSecret', AliceTxSecret);

let BobRxSecret = Bob.sharedSecret(AliceTx);
console.log('BobRxSecret', BobRxSecret);

// Key bob sends with
let BobTx = new Hashnet.KeyPair({
  n: Alice.n,
  s: Bob.s
});
console.log('BobTx', BobTx);

let BobTxSecret = BobTx.sharedSecret(Alice);
console.log('BobTxSecret', BobTxSecret);

let AliceRxSecret = Alice.sharedSecret(BobTx);
console.log('AliceRxSecret', AliceRxSecret);

// console.log('g =', buildGenerator(n));
