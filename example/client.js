const Peer  = require('simple-peer');
const fetch = require('node-fetch');

const peer = new Peer({
  initiator: true,
  trickle  : false,
});

peer.on('signal', data => {
  fetch('/offer', {
    method : 'POST', 
    body   : JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json',
    },
  }).then(async res => {
    peer.signal(await res.json());
  });
});

peer.on('connect', () => {
  console.log('CONNECT');
});

peer.on('data', data => {
  console.log('data', data.toString());
});
