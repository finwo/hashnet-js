if ('object' === typeof window) {
  module.exports = require('./websocket-browser');
} else {
  module.exports = require('./websocket-node');
}
