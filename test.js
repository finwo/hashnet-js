const ed      = require('ed25519-supercop');
const seed    = ed.createSeed();
const keypair = ed.createKeyPair(seed);

const kp = {
  pk: keypair.publicKey,
  sk: keypair.secretKey,
};

const sign = function( message, kp ) {
  return ed.sign( message, kp.pk, kp.sk );
};
const verify = function( signature, message, pk ) {
  return ed.verify( signature, message, pk );
};

const Hashnet = require('./index');
const hashnet = new Hashnet({
  crypto:{kp,sign,verify}
});


console.log(hashnet);
