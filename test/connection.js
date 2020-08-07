const EE = require('events').EventEmitter;

// Emulates simple-peer
function pipeFactory(input, output) {
  input.status   = 'connected';
  input.send     = chunk => {
    if (input.status !== 'connected') return;
    output.emit('data',chunk);
  };
  input.destroy = chunk => {
    if (input.status !== 'connected') return;
    if (chunk) input.send(chunk);
    input.emit('close');
    output.emit('close');
    input.status = 'closed';
    output.status = 'closed';
  };
}

module.exports = () => {
  const fds = [new EE(), new EE()];
  pipeFactory(fds[0], fds[1]);
  pipeFactory(fds[1], fds[0]);
  return fds;
};
