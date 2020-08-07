const EventEmitter = require('events').EventEmitter;

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
      id         : randomString(32),
      interval   : 5000,
      connections: [],
    }, options);

    // Setup timer tick
    this.timer = setInterval(() => {
      this.emit('tick');
    }, this.interval);

    // RTT ping
    this.on('tick', () => {
      for(const connection of this.connections) {
        connection.send(Buffer.from(JSON.stringify({
          t: 'ping',
          i: this.id,
          d: Date.now(),
        })));
      }
    });
  }

  // Handle adding a connection
  addConnection(connection) {
    this.connections.push(connection);

    // Handle incoming data
    connection.on('data', (buf) => {
      const message = JSON.parse(buf);
      switch(message.t) {

        // RTT handlers
        case 'ping':
          connection.id = message.i;
          connection.send(Buffer.from(JSON.stringify({
            t: 'pong',
            i: this.id,
            d: message.d,
          })));
          break;
        case 'pong':
          connection.rtt = Date.now() - message.d;
          connection.id  = message.i;
          break;

        default:
          console.log('message', message);
          break;
      }
    });

    // Handle lost connections
    connection.on('close', () => {
      const index = this.connections.indexOf(connection);
      if (!~index) return;
      this.connections.splice(index, 1);
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
      connection.destroy();
    }

  }

}

module.exports = Peer;
