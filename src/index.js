const EventEmitter = require('events');
const KeyPair  = require('asymmetric-diffie-hellman').KeyPair;
const fetch    = require('node-fetch');
const parseUrl = require('url-parse');
const Peer     = require('simple-peer');
const base64js = require('base64-js');
const aesjs    = require('aes-js');
const bigint   = require('big-integer');

const root = 'object' === typeof window ? window : global;
const atob = root.atob || base64js.toByteArray;
const btoa = root.btoa || base64js.fromByteArray;

// Return bit distance between 2 hex strings
function peerdistance(a, b) {
  a = new bigint(a, 16).toArray(2).value;
  b = new bigint(b, 16).toArray(2).value;

  let distance = 0;

  while(a.length > b.length) {
    if (a.shift()) distance++;
  }
  while(b.length > a.length) {
    if (b.shift()) distance++;
  }

  while(a.length) {
    if (a.shift() ^ b.shift()) distance++;
  }

  return distance;
}

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

    // Setup data receiver
    this._peers[this._kp.pubkey] = {
      pubkey    : this._kp.pubkey,
      self      : true,
      connection: {
        send: message => {
          message = message.toString();
          const tokens = message.split('.');

          // Discard corrupt messages
          if (tokens.length !== 4) {
            return;
          }

          // Assign more readable part names
          const [dst,src,nonce,data] = tokens;

          // Build decryption key
          const rxKey  = this._kp.keyExchange(src);

          // Turn transmission key into bytes for aes
          let secret = rxKey.secret.toArray(256).value;
          while(secret.length < this._kp.bits/8) {
            secret = [0].concat(secret);
          }

          // Encrypt our message
          const aesCtr         = new aesjs.ModeOfOperation.ctr(secret, new aesjs.Counter(parseInt(nonce,16)));
          const decryptedBytes = aesCtr.decrypt(atob(data));

          this.emit('ingest', decryptedBytes, src);
        }
      }
    };

    // Initialize peer discovery
    opts.bootstrap.forEach(function(url) {
      const parsed = parseUrl(url);
      const proto  = parsed.protocol.slice(0,-1);
      if (!HashNet.connectors[proto]) return;
      self._bootstrap.push(HashNet.connectors[proto](url));
    });

    // Bootstrap the network
    this._bootstrap.forEach(connector => {
      connector.connect(this);
    });

  }

  addPeer(peer) {

    // Give the remote our public key
    peer.send([
      peer.pubkey || '',
      this._kp.pubkey,
      '',
      ''
    ].join('.'));

    peer.on('data', data => {
      data = data.toString();
      const tokens = data.split('.');

      // Discard corrupt messages
      if (tokens.length !== 4) {
        return;
      }

      // Assign more readable part names
      const [dst,src,nonce,msg] = tokens;

      // pubkey distribution message
      if (!msg) {
        if (!this._peers[src]) {
          this._peers[src] = {
            connection: peer,
            pubkey    : src
          };
          this.emit('peer', this._peers[src]);
        }
        return;
      }

      // No destination = for us
      if (!dst) {
        dst = this._kp.pubkey;
      }

      // Relay message to recipient
      this.relay([dst,src,nonce,msg].join('.'));
    });
  }

  send(recipient, data) {
    const txKey  = this._kp.keyExchange(recipient);

    // Turn transmission key into bytes for aes
    let secret = txKey.secret.toArray(256).value;
    while(secret.length < this._kp.bits/8) {
      secret = [0].concat(secret);
    }

    // Ensure the same message doesn't result in the same encrypted bytes
    const nonce = ('00000000' + Math.floor(Math.random()*(2**32)).toString(16)).substr(-8);

    // Encrypt our message
    const aesCtr         = new aesjs.ModeOfOperation.ctr(secret, new aesjs.Counter(parseInt(nonce,16)));
    const encryptedBytes = aesCtr.encrypt(aesjs.utils.utf8.toBytes(data));

    // Let your freak flag fly
    this.relay([recipient, txKey.key, nonce, btoa(encryptedBytes)].join('.'));
  }

  relay(message) {
    message = message.toString();
    const tokens = message.split('.');

    // Discard corrupt messages
    if (tokens.length !== 4) {
      return;
    }

    // Assign more readable part names
    const [dst,src,nonce,msg] = tokens;

    // Find nearest peer to destination
    let nearestPeer = null;
    let nearestDist = null;
    Object.keys(this._peers).forEach(peerId => {
      let dist = peerdistance(peerId, dst);
      if ((!nearestPeer)||(dist < nearestDist)) {
        nearestPeer = peerId;
        nearestDist = dist;
      }
    });

    // Transmit
    this._peers[nearestPeer].connection.send(message);
  }

}

HashNet.connectors = {
  http: postConnector,
  https: postConnector,
};

module.exports.HashNet = HashNet;
