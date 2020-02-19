const Peer  = require('simple-peer');
const fetch = require('node-fetch');
const HashNet = require('../src/index').HashNet;

let net = new HashNet({bootstrap: [
  location.protocol + '//' + location.host + '/offer',
]});

net.on('peer', peer => {
  console.log('PEER', peer);
});

console.log(net);
