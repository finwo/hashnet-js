const EE = require('events').EventEmitter;

// Emulates simple-peer
function pipeFactory(input, output, delay) {
  delay = delay || 0;
  input.status   = 'connected';
  input.send     = chunk => {
    if (input.status !== 'connected') return;
    setTimeout(() => {
      output.emit('data', chunk);
    }, delay);
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

module.exports = (Adelay = 0, Bdelay = 0) => {
  const fds = [new EE(), new EE()];
  pipeFactory(fds[0], fds[1], Adelay);
  pipeFactory(fds[1], fds[0], Bdelay);
  return fds;
};
