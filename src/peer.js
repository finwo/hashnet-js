const EventEmitter = require('events').EventEmitter;
const BitBuffer    = require('./bitbuffer');
const msgpack      = require('@ygoe/msgpack');
const hook         = require('./hook');

function randomCharacter(alphabet = '0123456789abcdef') {
  return alphabet.substr(Math.floor(Math.random()*alphabet.length), 1);
}

function randomString(length=32, alphabet = '0123456789abcdef') {
  return Array(length).fill(alphabet).map(randomCharacter).join('');
}

class Peer extends EventEmitter {

  constructor(options) {
    super();

    // Allow configuration
    Object.assign(this, {
      id            : null,
      interval      : 5000,
      timeout       : 2000,
      maxConnections: 15,
      routeLabelSize: 32,
    }, options);

    // Ensure ID
    this.id = this.id || Buffer.from(randomString(64), 'hex');

    // Calculate route label size (in bits)
    this.routeLabelBits = 1;
    while(this.maxConnections >= (2**this.routeLabelBits)) this.routeLabelBits++;

    // Where to track connections & procedures
    this.connections = [];
    this.procedures  = {};
    this.hooks       = {};

    // Handle requests for connection listing (used in path finding)
    this.addProcedure({ name: 'discovery.connection', handler: (data) => {
      return {
        timestamp: data,
        connections: this.connections.filter(c => c).map(connection => {
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

    // Allow procedure detection
    this.addProcedure({ name: 'discovery.procedure', handler: () => {
      return Object.keys(this.procedures);
    }});

    // Setup timer tick
    this.timer = setInterval(() => {
      this.emit('tick');
    }, this.interval);

    // RTT ping init
    this.on('tick', async () => {
      for(const connection of this.connections) {
        const response = await this._callProcedure({
          routeLabel : Buffer.alloc(this.routeLabelSize),
          connection : connection,
          procedure  : 'ping',
          data       : Date.now(),
        });
        if (!response) continue;
        connection.rtt = Date.now() - response.timestamp;
        connection.id  = response.id;
      }
    });

    // RTT ping handler
    this.addProcedure({ name: 'ping', handler: data => ({
      timestamp: data,
      id       : this.id,
    })});
  }


  addProcedure({name, handler}) {
    if ('string' !== typeof name) return;
    if ('function' !== typeof handler) return;
    (this.procedures[name] = this.procedures[name] || []).push(handler);
  }

  removeProcedure({name, handler}) {
    if ('string' !== typeof name) return;
    this.procedures[name] = (this.procedures[name] || []).filter(fn => fn !== handler);
    if (!this.procedures[name].length) delete this.procedures[name];
  }

  addHook({name, handler}) {
    if ('string' !== typeof name) return;
    if ('function' !== typeof handler) return;
    (this.hooks[name] = this.hooks[name] || []).push(handler);
  }

  removeHook({name, handler}) {
    if ('string' !== typeof name) return;
    this.hooks[name] = (this.hooks[name] || []).filter(fn => fn !== handler);
    if (!this.hooks[name].length) delete this.hooks[name];
  }

  _callProcedure({ routeLabel, connection, socket, procedure, data, getResponse = true }) {
    return new Promise(async resolve => {

      const name     = randomString(32);
      let   finished = false;

      // Handle fallbacks from connection
      routeLabel = routeLabel || (connection && connection.routeLabel) || routeLabel;
      socket     = socket     || (connection && connection.socket    ) || socket;

      // Callback handler
      const handler = data => {
        finished = true;
        this.removeProcedure({ name, handler });
        resolve(data);
      };

      // Register callback
      if (getResponse) {
        this.addProcedure({ name, handler });
        setTimeout(() => {
          if (finished) return;
          this.removeProcedure({ name, handler });
          resolve(null);
        }, this.timeout);
      }

      // Make sure the route label is a buffer
      if ('string' === typeof routeLabel) routeLabel = BitBuffer.from(routeLabel.split('').map(v => parseInt(v)));
      if (routeLabel instanceof BitBuffer) {
        while (routeLabel.length < (this.routeLabelSize*8)) routeLabel.push(0);
        routeLabel = routeLabel.toBuffer();
      }

      // Prepare message
      const message = { fn: procedure };
      if ('undefined' !== typeof data) message.d = data;
      if (getResponse) message.cb = name;
      const messageBuffer = Buffer.concat([
        routeLabel,              // Route label passthrough
        Buffer.from([0]),        // 0 = no protocol extensions
        msgpack.encode(message), // wire-encoded message
      ]);

      // Send the message over the wire
      socket.send(messageBuffer);

      // Handle non-callback resolve
      if (!getResponse) {
        resolve();
      }
    });
  }

  // Handle adding a connection
  async addConnection(socket, id) {
    socket = await hook(this.hooks['add-connection'] || [], socket);
    const connection = { slot: 1, socket };

    // Allow passing known id as hex string
    if ('string' === typeof id) {
      connection.id = Buffer.from(id, 'hex');
    }

    // Find slot to place this in
    while(this.connections.find(conn => conn.slot == connection.slot)) {
      connection.slot++;
    }

    // Prevent too many connections
    if (connection.slot > this.maxConnections) {
      return 'too-many-connections';
    }

    // Register new connection
    this.connections.push(connection);

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
      message.extension     = message.data.slice(0,message.extensionSize);

      /* * * * * * * * * * * * * * * * * *\
       * No extensions are supported yet *
      \* * * * * * * * * * * * * * * * * */

      // Decode message
      message.d = msgpack.decode(message.data);
      if (!message.d) return;
      if (!message.d.fn) return;
      message.data = message.d.d;

      // Run procedure
      let returnData = message.data;
      for(const fn of (this.procedures[message.d.fn]||[()=>null])) {
        returnData = await fn(returnData, message);
      }

      // Return the queue result
      if (message.d.cb) {
        message.routeLabel.reverse();
        this._callProcedure({
          routeLabel  : message.routeLabel,
          connection  : connection,
          procedure   : message.d.cb,
          data        : returnData,
          getResponse : false,
        });
      }
    });

    // Un-register connection on close
    connection.socket.on('close', () => {
      const index = this.connections.indexOf(connection);
      if (!~index) return;
      this.connections.splice(index, 1);
    });
  }

  // Find's a path to a certain peer
  async _findPeer(peerId) {
    if (peerId instanceof Buffer) peerId = peerId.toString('hex');
    if (!peerId) return;

    // Tracking all connections
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
        procedure : 'discovery.connection',
        data      : Date.now(),
      });
      if (!response) {
        continue;
      }

      // Add found peers to the set
      const rtt = Date.now() - response.timestamp;
      for(const conn of response.connections) {
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

  async callProcedure({ peerId = null, procedure = null, getResponse = true, data = null }) {
    if (peerId instanceof Buffer) peerId = peerId.toString('hex');
    if ('string' !== typeof procedure) return;

    // Allow brokers to handle connect directly
    await hook(this.hooks['call-procedure'], { peerId });

    // Handle local call
    if ((peerId === null) || (peerId === this.id.toString('hex'))) {
      let returnData = data;
      for(const fn of (this.procedures[procedure]||[()=>null])) {
        returnData = await fn(returnData, {data});
      }
      return returnData;
    }

    // Find how to route towards peer
    const target = await this._findPeer(peerId);
    if (!target) throw Error("No path found");

    // Trigger remote call
    let response = this._callProcedure({
      ...target,
      procedure,
      getResponse,
      data,
    });

    return getResponse ? response : null;
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

    // Notify extensions
    this.emit('shutdown');
  }

}

module.exports = Peer;
