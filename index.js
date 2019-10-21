const b64     = require('base64url');
const BigInt  = require('big-integer');
const KeyPair = require('./keypair');

function Hashnet(opt) {

  opt = Object.assign({}, {
    bits : 256,
    bootstrap: [],
  }, opt);

  this.kp = new KeyPair();


  // this.p  = 
  // this.sk = Buffer.from(Array(32).fill(0).map(Math.floor(Math.random()*256)));
  // this.pk = 

  // // Deterministic network address
  // this.na = Buffer.from(this.kp.getPublic().encode());


}


// Hashnet.prototype.send = function( receiver, message ) {
//   if ('string' === typeof receiver) receiver = b64.toBuffer(receiver);
//   const sender = this.na;
//   console.log(receiver);
//   console.log(sender);
// }

Hashnet.KeyPair = KeyPair;
module.exports  = Hashnet;
