const crypto = Symbol();

function Hashnet(options) {

  // Setup crypto
  this[crypto] = Object.assign({}, (options||{}).crypto);
  this[crypto].kp    = this[crypto].kp    || {};
  this[crypto].kp.pk = this[crypto].kp.pk || Buffer.alloc(0);
  this[crypto].kp.sk = this[crypto].kp.sk || Buffer.alloc(0);

  this.id = this[crypto].kp.pk.toString('hex');

  // Where we'll track connections
  this.conn = {};


}

module.exports = Hashnet;
