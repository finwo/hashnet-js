const EventEmitter = require('events');
const KeyPair  = require('asymmetric-diffie-hellman').KeyPair;
const fetch    = require('node-fetch');
const parseUrl = require('url-parse');
const Peer     = require('simple-peer');

function postConnector(url) {
  return {
    url,
    connect(net) {
      const peer = new Peer({
        initiator: true,
        trickle  : false,
      });

      peer.on('signal', data => {
        fetch(url, {
          method : 'POST', 
          body   : JSON.stringify(data),
          headers: {
            'Content-Type': 'application/json',
          },
        }).then(async res => {
          peer.signal(await res.json());
        });
      });

      peer.on('connect', () => {
        net.addPeer(peer);
      });

      return peer;
    },
  };
}

class HashNet extends EventEmitter {
  constructor(opts) {
    super();
    const self = this;

    // Fallback options
    opts = Object.assign({
      adapters : null,
      bits     : 128,
      bootstrap: [],
    }, opts);

    // Build keypair
    this._kp = new KeyPair(opts);

    // Where to track connections
    this._peers = {};

    // How to bootstrap our network
    this._bootstrap = [];

    // Initialize bootstrap connectors
    opts.bootstrap.forEach(function(url) {
      const parsed = parseUrl(url);
      switch(parsed.protocol) {
        case 'http:':
        case 'https:':
          self._bootstrap.push(postConnector(url));
          break;
      }
    });

    this._bootstrap.forEach(connector => {
      connector.connect(this);
    });

  }

  addPeer(peer) {
    peer.send(JSON.stringify({
      type: 'pubkey',
      pubkey: this._kp.pubkey,
    }));
    peer.on('data', data => {
      data = JSON.parse(data);
      console.log('DATA', data);
      switch(data.type) {
        case 'pubkey':
          this._peers[data.pubkey] = peer;
          break;
        default:
          break;
      }
    });
  }
}

module.exports.HashNet = HashNet;
