import {KeyPair} from 'asymmetric-diffie-hellman';
import aesjs     from 'aes-js';

export class HashNet {

  constructor(opts) {
    opts = Object.assign({
      adapters: null;
      bits: 256,
    }, opts);

    if (null === opts.adapters) {
      opts.adapters = [
        require('./adapters/websocket-client')(opts),
      ];
    }

    // Build keypair
    this._kp = new KeyPair(opts);

    // Track list of known nodes
    this._nodes = {};
  }

  static createServer() {
    opts = Object.assign({
      bits: 256,
      port: process.env.PORT || 8080,
    }, opts);

    return new HashNet({
      adapters: [
        require('./adapters/websocket-server')(opts),
      ],
      bits,
    });
  }

};
