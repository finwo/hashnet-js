const EE = require('events').EventEmitter;

function pipeFactory(input, output) {
  input.writable = true;
  input.write    = chunk => {
    if (!input.writable) return;
    if (null === chunk) {
      output.write(null);
      output.emit('end');
      input.writable = false;
      return;
    }
    output.emit(chunk);
  };
  input.pipe = receiver => {
    input.on('data', chunk => {
      if (!receiver.writable) return;
      receiver.write(chunk);
    });
    return receiver;
  };
}

module.exports = () => {
  const fds = [new EE(), new EE()];
  pipeFactory(fds[0], fds[1]);
  pipeFactory(fds[1], fds[0]);
  return fds;
};
