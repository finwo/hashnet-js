const EventEmitter = require('events').EventEmitter;

function randomCharacter(alphabet = '0123456789abcdef') {
  return alphabet.substr(Math.floor(Math.random()*alphabet.length), 1);
}

function randomString(length=32, alphabet = '0123456789abcdef') {
  return Array(length).fill(alphabet).map(randomCharacter).join('');
}

// Message legend:
//    t     type       Type of the message
//    h     hop        Hops to destination
//    r     reverse    Reverse hop path
//    i     id         Transmitter ID
//    p     payload    Payload of the message
//
// 'ping':
//    p = timestamp in milliseconds
//    Poke the receiving peer
//
// 'pong':
//    p = ping's timestamp
//    Response to the ping message
//
// 'preq':
//    p = n/a
//
// 'pres':
//    p = peers { id: <string:id>, rtt: <integer:round-trip-time>, slot: <integer:hop> }
//
// 'data':
//    p = user message
//

// Message hopping
//    If a hop path is detected, incoming messages are relayed to the connection indicated by the hop
//

class Peer extends EventEmitter {

  constructor(options) {
    super();

    // Setup configurable variables
    Object.assign(this, {
      id            : randomString(32),
      interval      : 5000,
      connections   : [],
      timeout       : 2000,
    }, options);

    // Setup timer tick
    this.timer = setInterval(() => {
      this.emit('tick');
    }, this.interval);

    // FindPath statuses
    this._pathFinders = {};

    // RTT ping
    this.on('tick', () => {
      for(const connection of this.connections) {
        if (!connection) continue;
        connection.send(Buffer.from(JSON.stringify({
          t: 'ping',
          i: this.id,
          p: Date.now(),
          h: [],
          r: [],
        })));
      }
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
    connection.slot = this.connections.indexOf(connection);

    // Handle incoming data
    connection.on('data', (buf) => {
      const message = JSON.parse(buf);
      this._hear(message, connection);
    });


    // Handle lost connections
    connection.on('close', () => {
      const index = this.connections.indexOf(connection);
      if (!~index) return;
      this.connections[index] = null;
    });

  }

  // Incoming data
  _hear(message, incomingConnection) {

    // Handle passthrough/hop
    if (message.h.length) {
      const slot  = message.h.shift();
      const relay = this.connections.filter(c => c).find(c => c.slot == slot);
      if (!relay) return;
      if (incomingConnection) message.r.push(incomingConnection.slot);
      relay.send(Buffer.from(JSON.stringify(message)));
      return;
    }

    switch(message.t) {

      // RTT handlers
      case 'ping':
        incomingConnection.id = message.i;
        incomingConnection.send(Buffer.from(JSON.stringify({
          t: 'pong',
          i: this.id,
          p: message.p,
          h: message.r,
          r: [],
        })));
        break;
      case 'pong':
        if (message.r.length) {
          // TODO: handle relayed pong
        } else {
          incomingConnection.rtt = Date.now() - message.p;
          incomingConnection.id  = message.i;
        }
        break;

      // Peer request (routing purposes)
      case 'preq':
        incomingConnection.send(Buffer.from(JSON.stringify({
          t  : 'pres',
          i  : this.id,
          fid: message.fid,
          p  : this.connections.filter(c => c).map(conn => ({ id: conn.id, rtt: conn.rtt, slot: conn.slot })),
          h  : message.r,
          r  : [],
        })));
        break;
      case 'pres':
        if (!message.fid) return;
        if (!this._pathFinders[message.fid]) return;
        this._pathFinders[message.fid].recv(message);
        break;

      // Data message
      case 'data':
        this._hear(message);
        break;

      default:
        console.log('UNKNOWN', message);
        break;
    }

  }

  // Find's a path to a certain peer
  _findPath(peerId) {
    return new Promise(resolve => {
      const findId              = randomString(32);
      let   resolved            = false;

      // Schedule clean-up
      function timeoutHandler() {
        if (resolved) return;
        resolved = true;
        delete this._pathFinders[findId];
        resolve(false);
      }

      const finder = this._pathFinders[findId] = {
        timer: setTimeout(timeoutHandler.bind(this), this.timeout),
        known: {},
        recv: (message) => {
          if (resolved) return;
          clearTimeout(finder.timer);
          finder.timer = setTimeout(timeoutHandler.bind(this), this.timeout);
          const self = message.i === this.id;
          if ((!self) && (!finder.known[message.i])) return;
          for(const peer of message.p) {
            if (finder.known[peer.id]) continue;
            finder.known[peer.id] = {
              rtt: peer.rtt + (self ? 0 : finder.known[message.i].rtt),
              path: [].concat(self ? [] : finder.known[message.i].path, [peer.slot]),
            };
            if (peer.id === peerId) {
              const path = finder.known[peer.id].path;
              resolved = true;
              clearTimeout(finder.timer);
              resolve(path);
              return;
            }
            const conn = this.connections[finder.known[peer.id].path[0]];
            conn.send(Buffer.from(JSON.stringify({
              t  : 'preq',
              i  : this.id,
              fid: findId,
              h  : finder.known[peer.id].path.slice(1),
              r  : [],
            })));
          }
        },
      };

      // Kick-start resolving routine
      this._hear({
        t  : 'pres',
        fid: findId,
        i  : this.id,
        p  : this.connections.map(conn => ({ id: conn.id, rtt: conn.rtt, slot: conn.slot })),
        h  : [],
        r  : [],
      });
    });
  }

  // Send message to a specific peer
  async send(data, peerId) {
    const path = await this._findPath(peerId);
    if (!path) return;
    const conn = this.connections[path.shift()];
    conn.send(Buffer.from(JSON.stringify({
      t: 'data',
      i: this.id,
      p: data,
      h: path,
      r: [],
    })));
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
