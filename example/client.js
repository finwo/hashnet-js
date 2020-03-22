const HashNet = require('../src/index').HashNet;

let sleep = async n => {
  return new Promise(r=>setTimeout(r,n));
}

(async () => {
  output.innerText += "Generating keypair\n";
  await sleep(10);

  let net = new HashNet({bootstrap: [
    location.protocol + '//' + location.host + '/offer',
  ]});

  net.on('peer', peer => {
    output.innerText+="PEER: " + peer.pubkey + "\n";
  });

  console.log(net);

})();



