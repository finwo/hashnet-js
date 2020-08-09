const EventEmitter = require('events').EventEmitter;
const BitBuffer    = require('./bitbuffer');
const msgpack      = require('@ygoe/msgpack');
const crypto       = require('crypto');
const supercop     = require('supercop');

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
          this.id = keypair.publicKey.toString('hex');
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
        const response = await this._callProcedureRaw({
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

  _callProcedureRaw({ routeLabel, connection, procedure, data, callback = true }) {
    let   name = '';
    const self = this;
    return new Promise(resolve => {
      function handler(data) {
        self.removeProcedure({ name, handler });
        resolve(data);
      }
      if (callback) {
        name = randomString(32);
        this.addProcedure({name, handler});
      }
      if ('string' === typeof routeLabel) routeLabel = BitBuffer.from(routeLabel.split('').map(v => parseInt(v)));
      if (routeLabel instanceof BitBuffer) routeLabel = routeLabel.toBuffer();
      connection.send(Buffer.concat([
        routeLabel,
        Buffer.from([procedure.length]),
        Buffer.from(procedure),
        Buffer.from([name.length]),
        Buffer.from(name),
        msgpack.encode(data),
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
        const hopConnection = this.connections.find(conn => conn.slot === nextHop);
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

      // No transfer, let's detect the procedure to call
      message.procedureNameSize = message.data.slice(0,1)[0];
      message.data              = message.data.slice(1);
      message.procedureName     = message.data.slice(0,message.procedureNameSize).toString();
      message.data              = message.data.slice(message.procedureNameSize);
      message.callbackNameSize  = message.data.slice(0,1)[0];
      message.data              = message.data.slice(1);
      message.callbackName      = message.data.slice(0,message.callbackNameSize).toString();
      message.data              = msgpack.decode(message.data.slice(message.callbackNameSize));

      // Return-less events
      this.emit(message.procedureName, message.data);

      // Create call queue
      let queue = new Promise(r => r(message));
      for(let fn of (this.procedures[message.procedureName]||[()=>null])) {
        queue = queue.then(fn);
      }

      // Return the queue result
      if (message.callbackNameSize) {
        message.routeLabel.reverse();
        this._callProcedureRaw({
          callback  : false,
          routeLabel: message.routeLabel,
          connection,
          procedure: message.callbackName,
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
    const knownPeers = this.connections.reduce((r,conn) => {
      r[conn.id] = {
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

    // Keep running until there are no more peers to interrogate
    while(peerQueue.length) {
      peerQueue.sort((a, b) => a.rtt - b.rtt);
      const peerInterrogate = peerQueue.shift();
      const connection      = peerInterrogate.connection;
      const routeLabel      = BitBuffer.from(
        (peerInterrogate.routeLabel + '0'.repeat(this.routeLabelSize*8))
          .substr(0,this.routeLabelSize*8)
          .split('')
          .map(v => parseInt(v))
      );

      // Fetch connected peers from interrogated peer
      const responseMessage = await this._callProcedureRaw({
        routeLabel,
        connection,
        procedure: 'connectionDiscovery',
        data     : null,
      });

      // Add returned peers to the process queue
      for(let foundPeer of responseMessage.data) {
        if (knownPeers[foundPeer.id]) continue;
        knownPeers[foundPeer.id] = foundPeer = {
          ...foundPeer,
          connection: peerInterrogate.connection,
          routeLabel: peerInterrogate.routeLabel + foundPeer.routeLabel,
          rtt       : peerInterrogate.rtt        + foundPeer.rtt,
        };
        if (foundPeer.id === peerId) return foundPeer;
        peerQueue.push(foundPeer);
      }

    }

    return null;
  }

  // Send message to a specific peer
  async send(data, peerId) {
    // const path = await this._findPath(peerId);
    // if (!path) return false;
    // const conn = this.connections[path.shift()];
    // conn.send(Buffer.from(JSON.stringify({
    //   t: 'data',
    //   i: this.id,
    //   p: data,
    //   h: path,
    //   r: [],
    // })));
    // return true;
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
