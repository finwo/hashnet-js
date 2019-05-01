function Hashnet( options ) {
  if (!(this instanceof Hashnet)) throw new Error("'new' is required when calling hashnet");
  options = Object.assign({},options);
  var net = this;

  // Data holding
  this._listeners   = {}; // {object}<[name]:{object}<{function}>>
  this._nodes       = []; // {array}<{string}>
  this._connections = []; // {array}<{object}<node:{string},id:{string},--comms-->>
  this._known       = {}; // {object}<[id]:{object}<expires:{number},signal:{function}>>
  this._data        = {}; // {object}<[key]:{expires:{number},value:{string}}

  // Protocol handlers
  this._proto = {};

  // Register protocol handlers
  if (Array.isArray(options.adapters)) {
    options.adapters.forEach(function(adapter) {
      net.registerAdapter(adapter);
    });
  }

  // TODO: connection structure
  //   {
  //     node   : {string},   // ID of local peer (must be in _nodes)
  //     id     : {string},   // ID of remote peer
  //     send   : {function}, // Sending data to the remote peer
  //     signal : {function}, // Include ID, control channel (req list, brokering)
  //   }
}

/**
 * Locally emit an event
 *
 * @param {string} event
 * @param {mixed}  data
 *
 * @return {void}
 */
Hashnet.prototype.emit = function( event, data ) {
  if (!this._listeners[event]) return;
  var context = this;
  this._listeners[event].forEach(function(handler) {
    try {
      handler.call(context, data);
    } catch(e) {}
  });
};

/**
 * Attach handler to an event
 *
 * @param {string}   event
 * @param {function} handler
 *
 * @return {void}
 */
Hashnet.prototype.on = function( event, handler ) {
  if (!this._listeners[event]) this._listeners[event] = [];
  this._listeners[event].push(handler);
};

/**
 * Remove handler from an event
 *
 * @param {string}   event
 * @param {function} handler
 *
 * @return {void}
 */
Hashnet.prototype.off = function( event, handler ) {
  if (!this._listeners[event]) return;
  var index = this._listeners[event].indexOf(handler);
  if (~index) this._listeners.splice(index,1);
};

/**
 * Receive signalling data
 */
Hashnet.prototype.signal = function( id, data ) {

};

/**
 * Register an adapter (network handler)
 *
 * TODO
 */
Hashnet.prototype.registerAdapter = function(  ) {
  // TODO: WHAT DOES AN ADAPTER CONTAIN:
  // - (SEMI)DIRECT CONNECT
  // - BROKERED CONNECT
};

module.exports = Hashnet;
