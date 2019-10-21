const aes     = require('aes-js');
const BigInt  = require('big-integer');
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
