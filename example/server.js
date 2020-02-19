const argv    = require('minimist')(process.argv.slice(2));
const http    = require('http');
const port    = parseInt(argv.port || argv.p || process.env.PORT || 5000);
const express = require('express');
const app     = express();
const Peer    = require('simple-peer');
const wrtc    = require('wrtc');

app.use(express.static(__dirname, {
  index: ['index.html'],
}));

app.use(require('body-parser').json());

app.post('/offer', (req, res) => {
  const peer = new Peer({wrtc, trickle: false});

  peer.on('signal', data => {
    res.json(data);
  });

  peer.signal(req.body);

  peer.on('connect', () => {
    peer.send('DINGES');
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log('Listening on 0.0.0.0:'+port);
});
