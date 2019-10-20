const b64    = require('base64url');
const BigInt = require('big-integer');

function rand(bits) {
  return BigInt(Buffer.from(Array(bits/8).fill(0).map(a=>Math.floor(Math.random()*256))).toString('hex'), 16);
}

function randPrime(bits, minbits) {
  let n = BigInt(0);
  let min = minbits ? BigInt(2).pow(minbits) : 0;
  while(n.lesser(min) || (!n.isPrime())) {
    n = rand(bits);
  }
  return n;
}

function primefactors(n, testlimit) {
  let factors = [];
  let i = BigInt(3);

  while(n.mod(2).isZero()) {
    factors.push(2);
    n = n.over(2);
    if (n.isPrime()) {
      return factors;
    }
  }

  // Fully factor it
  for(i=i; i.times(i).lt(n); i = i.plus(2)) {
    if(i.gt(testlimit)) return false;
    while(n.mod(i).isZero()) {
      factors.push(i);
      n = n.over(i);
      if (n.isPrime()) {
        return factors;
      }
    }
  }

  return factors
}

function buildGenerator(p, testlimit) {
  let r       = BigInt(2);
  let phi     = p.minus(1);
  let factors = primefactors(phi, testlimit);

  if (false === factors) return false;

  while(r.lesserOrEquals(p)) {
    let found = false;

    for(const factor of factors) {
      if (!r.modPow(phi.over(factor), p).compare(1)) {
        found = true;
        break;
      }
    }

    if (!found) {
      return r;
    }

    r = r.plus(1);
  }

  return false;
}

function genPub(bits, complexity) {
  complexity = BigInt(2).pow(complexity || 24);
  let n = false;
  let g = false;
  do {
    n = randPrime(bits, bits-8);
    g = buildGenerator(n, complexity);
  } while(g === false);
  return [n,g];
}

function Hashnet(opt) {

  opt = Object.assign({}, {
    bits : 256,
    bootstrap: [],
  }, opt);

  let [n,g] = genPub(opt.bits);
  this.n = n;
  this.g = g;

  do {
    this.a = rand(opt.bits);
  } while(this.a.gt(this.n));

  // this.p  = 
  // this.sk = Buffer.from(Array(32).fill(0).map(Math.floor(Math.random()*256)));
  // this.pk = 

  // // Deterministic network address
  // this.na = Buffer.from(this.kp.getPublic().encode());


}


// Hashnet.prototype.send = function( receiver, message ) {
//   if ('string' === typeof receiver) receiver = b64.toBuffer(receiver);
//   const sender = this.na;
//   console.log(receiver);
//   console.log(sender);
// }

module.exports = Hashnet;
