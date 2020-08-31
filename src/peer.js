const EventEmitter = require('events').EventEmitter;
const BitBuffer    = require('./bitbuffer');
const msgpack      = require('@ygoe/msgpack');

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

    // No ID = generate one
    if (!this.id) {
      this.id = Buffer.from(randomString(64), 'hex');
    }

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
    this.addProcedure({ name: 'connectionDiscovery', handler: ({data}) => {
      return {
        timestamp: data,
        connections: this.connections.map(connection => {
          let routeLabel = BitBuffer.fromBuffer(Buffer.from([connection.slot]));
          routeLabel.shiftUint(routeLabel.length - this.routeLabelBits);
          return {
            id        : connection.id,
            routeLabel: routeLabel.join(''),
            rtt       : connection.rtt,
          };
        }),
      };
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
          routeLabel : Buffer.alloc(this.routeLabelSize),
          connection : connection,
          procedure  : 'ping',
          data       : Date.now(),
        });
        connection.rtt = Date.now() - response.data.timestamp;
        connection.id  = response.data.id;
      }
    });

    // RTT ping handler
    this.addProcedure({ name: 'ping', handler: ({data}) => {
      return {
        timestamp: data,
        id       : this.id,
      };
    }});

    // RTT response handler
    this.addProcedure({ name: 'pong', handler: ({data, connection}) => {
      connection.id  = data.id;
      connection.rtt = Date.now() - data.timestamp;
    }});
  }

  addProcedure({ name, handler }) {
    (this.procedures[name] = this.procedures[name] || []).push(handler);
  }

  removeProcedure({ name, handler }) {
    this.procedures[name] = (this.procedures[name] || []).filter(fn => fn !== handler);
    if (!this.procedures[name].length) delete this.procedures[name];
  }

  _callProcedure({ routeLabel, connection, procedure, data, callback = true }) {
    return new Promise(async resolve => {
      const name = randomString(32);

      // Callback handler
      const handler = data => {
        this.removeProcedure({ name, handler });
        resolve(data);
      };

      // Register callback
      if (callback) {
        this.addProcedure({ name, handler });
      }

      // Make sure the route label is a buffer
      if ('string' === typeof routeLabel) routeLabel = BitBuffer.from(routeLabel.split('').map(v => parseInt(v)));
      if (routeLabel instanceof BitBuffer) routeLabel = routeLabel.toBuffer();

      // Prepare message
      const message = { fn: procedure, d: data };
      if (callback) message.cb = name;
      const messageBuffer = Buffer.concat([
        routeLabel,              // Route label passthrough
        Buffer.from([0]),        // 0 = no protocol extensions
        msgpack.encode(message), // msgpack-encoded message
      ]);

      // Send the message over the wire
      connection.socket.send(messageBuffer);

      // Handle non-callback resolve
      if (!callback) {
        resolve();
      }
    });
  }

  // Handle adding a connection
  addConnection(socket) {
    const connection = { socket };

    // Prevent too many connections
    if (this.connections.length >= this.maxConnections) {
      return 'too-many-connections';
    }

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
    connection.socket.on('data', async buf => {

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
        hopConnection.socket.send(Buffer.concat([
          message.routeLabel.toBuffer(),
          message.data,
        ]));
        return;
      } else {
        message.routeLabel.unshift(...Array(this.routeLabelBits).fill(0));
      }

      // Detect protocol extensions
      message.extensionSize = message.data.slice(0,1)[0];
      message.data          = message.data.slice(1);

      /* * * * * * * * * * * * * * * * * *\
       * No extensions are supported yet *
      \* * * * * * * * * * * * * * * * * */

//       // Detect encrypted messages
//       message.cryptoNameSize = message.data.slice(0,1)[0];
//       message.cryptoName     = message.data.slice(1,1 + message.cryptoNameSize).toString();
//       message.data           = message.data.slice(1 + message.cryptoNameSize);

//       // Handle encrypted messages
//       if (message.cryptoNameSize) {
//         if (!cryptos[message.cryptoName]) return;
//         message.senderIdSize = message.data.slice(0,1)[0];
//         message.data         = message.data.slice(1);
//         message.senderId     = message.data.slice(0,message.senderIdSize);
//         message.data         = message.data.slice(message.senderIdSize);
//         message.sharedSecret = await supercop.keyExchange(message.senderId, this.kp.secretKey);
//         const cipher         = cryptos[message.cryptoName](message.sharedSecret);
//         message.data         = Buffer.concat([cipher.decrypt(message.data)]);
//       }

      // Decode message
      message.d = msgpack.decode(message.data);
      if (!message.d) return;
      if (!message.d.fn) return;
      message.data = message.d.d;

      // Create call queue
      let queue = Promise.resolve(message);
      for(const fn of (this.procedures[message.d.fn]||[()=>null])) {
        queue = queue.then(fn);
      }

      // Return the queue result
      if (message.d.cb) {
        message.routeLabel.reverse();
        const data = msgpack.encode({ fn: message.d.cb, d: await queue });
        const msg  = Buffer.concat([
          message.routeLabel.toBuffer(), // Return path
          Buffer.from([0]),              // 0 = no extensions
          data,                          // msgpack-encoded message
        ]);
        connection.socket.send(msg);
      }
    });

    // Handle lost connections
    connection.socket.on('close', () => {
      const index = this.connections.indexOf(connection);
      if (!~index) return;
      this.connections[index] = null;
    });
  }

  // Find's a path to a certain peer
  async _findPeer(peerId) {
    if (peerId instanceof Buffer) peerId = peerId.toString('hex');

    const closedset = {};
    const openset   = this.connections.slice().map(peer => Object.assign({routeLabel:''},peer));
    openset.sort((left, right) => {
      return left.rtt - right.rtt;
    });

    while(openset.length) {

      // Fetch lowest rtt peer
      const current   = openset.shift();
      const currentId = current.id.toString('hex');

      // Handle found peer
      if (peerId == currentId) {
        return current;
      }

      // Already known = skip
      if (closedset[currentId]) continue;
      closedset[currentId] = current;

      // Build routelabel to the peer
      const routeLabel = BitBuffer.from(
        (current.routeLabel + '0'.repeat(this.routeLabelSize*8))
          .substr(0,this.routeLabelSize*8)
          .split('')
          .map(v => parseInt(v))
      );

      // Fetch peers the interrogated peer is connected to
      const response = await this._callProcedure({
        routeLabel,
        connection: current,
        procedure : 'connectionDiscovery',
        data      : Date.now(),
      });

      // Add found peers to the set
      const rtt = Date.now() - response.data.timestamp;
      for(const conn of response.data.connections) {
        openset.push(Object.assign({}, current, {
          id        : conn.id,
          rtt       : rtt + conn.rtt,
          routeLabel: current.routeLabel + conn.routeLabel,
        }));
      }
      openset.sort((left, right) => {
        return left.rtt - right.rtt;
      });
    }
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
      connection.socket.destroy();
    }

  }

}

module.exports = Peer;
