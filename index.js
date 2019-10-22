const aes     = require('aes-js');
const BigInt  = require('big-integer');
const isBuffer = require('is-buffer');
const KeyPair = require('./keypair');

function Hashnet(opt) {

  opt = Object.assign({}, {
    bits : 256,
    bootstrap: [],
  }, opt);

  this.kp = new KeyPair();
  this.id = this.kp.getPublic();
}

Hashnet.prototype.send = function(destination, message) {
  let receiverKey = new KeyPair({ public: destination })
  let senderKey   = new KeyPair({ n: receiverKey.n, s: this.kp.s });
  let secret      = senderKey.sharedSecret(receiverKey);
  let m           = [...Buffer.from(this.kp.getPublic(), 'hex')];
  let tokenChars  = senderKey.bits / 4;
  let prefix      = '0'.repeat(tokenChars);

  secret = (prefix + (secret.toString(16))).substr(-tokenChars);
  secret = [...Buffer.from(secret, 'hex')];
  console.log(secret.length, secret);

  if ('string' === typeof message) message = Buffer.from(message);
  if (isBuffer(message)) message = [...message];


  let aesCtr = new aes.ModeOfOperation.ctr(secret);
  console.log(aesCtr);
  // TODO: normalize message
  // TODO: m = m.concat(message)
  // TODO: aes(m)
};


// Hashnet.prototype.send = function( receiver, message ) {
//   if ('string' === typeof receiver) receiver = b64.toBuffer(receiver);
//   const sender = this.na;
//   console.log(receiver);
//   console.log(sender);
// }

Hashnet.KeyPair = KeyPair;
module.exports  = Hashnet;
