const EventEmitter = require('events').EventEmitter;
const BitBuffer    = require('./bitbuffer');
const msgpack      = require('@ygoe/msgpack');
const crypto       = require('crypto');
const supercop     = require('supercop');
const aesjs        = require('aes-js');

const cryptos = {
  'aes-256-ctr': key => new aesjs.ModeOfOperation.ctr(key),
};
const defaultCrypto = 'aes-256-ctr';

function randomCharacter(alphabet = '0123456789abcdef') {
  return alphabet.substr(Math.floor(Math.random()*alphabet.length), 1);
}

function randomString(length=32, alphabet = '0123456789abcdef') {
  return Array(length).fill(alphabet).map(randomCharacter).join('');
}

class Peer extends EventEmitter {

  constructor(options) {
    super();

    // Setup configurable variables
    Object.assign(this, {
      id             : null,
      interval       : 5000,
      timeout        : 2000,
      maxConnections : 15,
      routeLabelSize : 32,
    }, options);

    // Start generating our ID
    this._ready = Promise.all([
      supercop
        .createKeyPair(crypto.randomBytes(32))
        .then(keypair => {
          this.kp = keypair;
          this.id = keypair.publicKey;
        })
    ]);

    // Calculate route label size (in bits)
    this.routeLabelBits = (() => {
      let size = 1;
      while(this.maxConnections >= (2**size)) size++;
      return size;
    })();

    // Where to track connections & procedures
    this.connections = [];
    this.procedures  = {};

    // Handle requests for connection listing (used in path finding)
    this.addProcedure({ name: 'connectionDiscovery', handler: () => {
      return this.connections.map(connection => {
        let routeLabel = BitBuffer.fromBuffer(Buffer.from([connection.slot]));
        routeLabel.shiftUint(routeLabel.length - this.routeLabelBits);
        return {
          id        : connection.id,
          routeLabel: routeLabel.join(''),
          rtt       : connection.rtt,
        };
      });
    }});

    // Setup timer tick
    this.timer = setInterval(() => {
      this.emit('tick');
    }, this.interval);

    // RTT ping init
    this.on('tick', async () => {
      for(const connection of this.connections) {
        if (!connection) continue;
        const response = await this._callProcedure({
          routeLabel: Buffer.alloc(this.routeLabelSize),
          connection: connection,
          procedure : 'ping',
          data      : { timestamp: Date.now() }
        });
        connection.rtt = Date.now() - response.data.timestamp;
        connection.id  = response.data.id;
      }
    });

    // RTT ping handler
    this.addProcedure({ name: 'ping', handler: message => {
      return {
        timestamp: message.data.timestamp,
        id       : this.id,
      };
    }});
  }

  addProcedure({ name, handler }) {
    (this.procedures[name] = this.procedures[name] || []).push(handler);
  }

  removeProcedure({ name, handler }) {
    this.procedures[name] = (this.procedures[name] || []).filter(fn => fn !== handler);
    if (!this.procedures[name].length) delete this.procedures[name];
  }

  _callProcedure({ routeLabel, peerId = null, connection, procedure, data, callback = true }) {
    let   name = '';
    const self = this;

    // Use old promise structure to have 2 resolve paths
    return new Promise(async resolve => {

      // callback handler
      function handler(data) {
        self.removeProcedure({ name, handler });
        resolve(data);
      }
      if (callback) {
        name = randomString(32);
        this.addProcedure({name, handler});
      }

      // Make sure the route label is a bitbuffer
      if ('string' === typeof routeLabel) routeLabel = BitBuffer.from(routeLabel.split('').map(v => parseInt(v)));
      if (routeLabel instanceof BitBuffer) routeLabel = routeLabel.toBuffer();

      // Prepare message as buffer
      let cryptobuf = Buffer.alloc(1).fill(0);
      let message   = Buffer.concat([msgpack.encode({
        fn: procedure,
        cb: name,
        d : data,
      })]);

      // Handle encryption if receiver id is known
      if (peerId && peerId.length) {
        const selectedCrypto = defaultCrypto;
        const sharedSecret   = await supercop.key_exchange(peerId, this.kp.secretKey);
        const cipher         = cryptos[selectedCrypto](sharedSecret);
        cryptobuf = Buffer.concat([
          Buffer.from([selectedCrypto.length]),
          Buffer.from(selectedCrypto),
          Buffer.from([this.kp.publicKey.length]),
          this.kp.publicKey,
        ]);
        message = Buffer.concat([cipher.encrypt(message)]);
      }

      // Send the message over the wire
      connection.send(Buffer.concat([
        routeLabel,
        cryptobuf,
        message,
      ]));
    });
  }

  // Handle adding a connection
  addConnection(connection) {

    // Re-use old slot if available
    let reusedSlot = false;
    this.connections.forEach((conn, index) => {
      if (reusedSlot) return;
      if (!conn) {
        this.connections[index] = connection;
        reusedSlot              = true;
      }
    });

    // Create new slot if not re-used
    if (!reusedSlot) {
      this.connections.push(connection);
    }

    // Assign slot
    connection.slot = this.connections.indexOf(connection) + 1;

    // Handle incoming data
    connection.on('data', async buf => {

      // Split data & routing
      const message = {
        connection: connection,
        routeLabel: BitBuffer.fromBuffer(buf.slice(0,this.routeLabelSize)),
        data      : buf.slice(this.routeLabelSize),
      };

      // Transfer to next host if requested
      const nextHop = message.routeLabel.shiftUint(this.routeLabelBits);
      if (nextHop) {
        const hopConnection = this.connections.filter(c => c).find(conn => conn.slot === nextHop);
        if (!hopConnection) return;
        let returnHop = BitBuffer.fromBuffer(Buffer.from([connection.slot]));
        returnHop.shiftUint(returnHop.length - this.routeLabelBits);
        returnHop.reverse();
        message.routeLabel.push(...returnHop);
        hopConnection.send(Buffer.concat([
          message.routeLabel.toBuffer(),
          message.data,
        ]));
        return;
      } else {
        message.routeLabel.unshift(...Array(this.routeLabelBits).fill(0));
      }

      // Detect encrypted messages
      message.cryptoNameSize = message.data.slice(0,1)[0];
      message.cryptoName     = message.data.slice(1,1 + message.cryptoNameSize).toString();
      message.data           = message.data.slice(1 + message.cryptoNameSize);

      // Handle encrypted messages
      if (message.cryptoNameSize) {
        if (!cryptos[message.cryptoName]) return;
        message.senderIdSize = message.data.slice(0,1)[0];
        message.data         = message.data.slice(1);
        message.senderId     = message.data.slice(0,message.senderIdSize);
        message.data         = message.data.slice(message.senderIdSize);
        message.sharedSecret = await supercop.key_exchange(message.senderId, this.kp.secretKey);
        const cipher         = cryptos[message.cryptoName](message.sharedSecret);
        message.data         = Buffer.concat([cipher.decrypt(message.data)]);
      }

      // Decode message
      message.d    = msgpack.decode(message.data);
      message.data = message.d.d;

      // Return-less events
      this.emit(message.d.fn, message.data);

      // Create call queue
      let queue = new Promise(r => r(message));
      for(let fn of (this.procedures[message.d.fn]||[()=>null])) {
        queue = queue.then(fn);
      }

      // Return the queue result
      if (message.d.cb) {
        message.routeLabel.reverse();
        this._callProcedure({
          peerId    : message.senderId ? message.senderId : Buffer.alloc(0),
          callback  : false,
          routeLabel: message.routeLabel,
          connection,
          procedure: message.d.cb,
          data     : (await queue) || null,
        });
      }
    });

    // Handle lost connections
    connection.on('close', () => {
      const index = this.connections.indexOf(connection);
      if (!~index) return;
      this.connections[index] = null;
    });
  }

  // Find's a path to a certain peer
  async _findPeer(peerId) {
    if (peerId instanceof Buffer) peerId = peerId.toString('hex');
    const knownPeers = this.connections.reduce((r,conn) => {
      r[conn.id.toString('hex')] = {
        id        : conn.id,
        rtt       : conn.rtt,
        connection: conn,
        routeLabel: '',
      };
      return r;
    }, {});
    const peerQueue  = Object.values(knownPeers);

    // Attempt returning without querying
    if (knownPeers[peerId]) return knownPeers[peerId];

    // Setup timeout
    let timeoutTimer = null;
    let resolved     = false;
    return new Promise(async resolve => {
      function timeoutHandler() {
        if (resolved) return;
        resolved = true;
        resolve(null);
      }
      timeoutTimer = setTimeout(timeoutHandler, this.timeout);

      // Keep running until there are no more peers to interrogate
      while(peerQueue.length) {

        // Fetch next peer with lowest RTT
        peerQueue.sort((a, b) => a.rtt - b.rtt);
        const peerInterrogate = peerQueue.shift();
        const peerInterrogateId = peerInterrogate.id.toString('hex');
        const connection      = peerInterrogate.connection;
        const routeLabel      = BitBuffer.from(
          (peerInterrogate.routeLabel + '0'.repeat(this.routeLabelSize*8))
            .substr(0,this.routeLabelSize*8)
            .split('')
            .map(v => parseInt(v))
        );

        // Fetch connected peers from interrogated peer
        const responseMessage = await this._callProcedure({
          routeLabel,
          connection,
          peerId   : peerInterrogate.id,
          procedure: 'connectionDiscovery',
          data     : null,
        });

        // Reset timeout
        if (resolved) return;
        clearTimeout(timeoutTimer);
        timeoutTimer = setTimeout(timeoutHandler, this.timeout);

        // Add returned peers to the process queue
        for(let foundPeer of responseMessage.data) {
          const foundPeerId = foundPeer.id.toString('hex');
          if (knownPeers[foundPeerId]) continue;
          knownPeers[foundPeerId] = foundPeer = {
            ...foundPeer,
            connection: peerInterrogate.connection,
            routeLabel: peerInterrogate.routeLabel + foundPeer.routeLabel,
            rtt       : peerInterrogate.rtt        + foundPeer.rtt,
          };
          if (foundPeerId === peerId) {
            resolved = true;
            clearTimeout(timeoutTimer);
            return resolve(foundPeer);
          }
          peerQueue.push(foundPeer);
        }

      }

    });
  }

  // Stops activity
  shutdown() {

    // Stop timer
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;

    // Close all connections
    for(const connection of this.connections) {
      if (!connection) continue;
      connection.destroy();
    }

  }

}

module.exports = Peer;
