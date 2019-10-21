const BigInt   = require('big-integer');
const cachify  = require('lru-cachify');
const isBuffer = require('is-buffer');

function rand(bits) {
  let b = Buffer.from(Array(bits/8).fill(0).map(a=>Math.floor(Math.random()*256))).toString('hex');
  let n = BigInt(b, 16);
  return n;
}

function randPrime(bits, minbits) {
  let n = BigInt(0);
  let min = minbits ? BigInt(2).pow(minbits) : 0;
  while(n.lesser(min) || (!n.isPrime())) {
    n = rand(bits);
  }
  return n;
}

const primefactors = cachify(function(n, testlimit) {
  let factors = [];
  let i = BigInt(3);
  while(n.mod(2).isZero()) {
    factors.push(BigInt(2));
    n = n.over(2);
    if (n.isPrime()) {
      return factors;
    }
  }
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
});

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


function buildModulo(bits, complexity) {
  complexity = BigInt(2).pow(complexity || 24);
  let n = false;
  let g = false;
  do {
    n = randPrime(bits, bits-16);
    g = buildGenerator(n, complexity);
  } while(g === false);
  return {n,g};
}

function buildSecret(bits, n) {
  return rand(bits);
}

function KeyPair(opts) {
  opts = Object.assign({}, {
    bits      : 256,
    public    : false,
    private   : false,
    s         : false,
    g         : false,
    n         : false,
  }, opts);

  // Normalize public/private into strings
  if (Array.isArray(opts.public)) opts.public = Buffer.from(opts.public);
  if (Array.isArray(opts.private)) opts.private = Buffer.from(opts.private);
  if (isBuffer(opts.public)) opts.public = opts.public.toString('hex');
  if (isBuffer(opts.private)) opts.private = opts.private.toString('hex');

  // Normalize s/g/n/p into strings
  if (Array.isArray(opts.s)) opts.s = Buffer.from(opts.s);
  if (Array.isArray(opts.g)) opts.g = Buffer.from(opts.g);
  if (Array.isArray(opts.n)) opts.n = Buffer.from(opts.n);
  if (Array.isArray(opts.p)) opts.p = Buffer.from(opts.p);
  if (isBuffer(opts.s)) opts.s = opts.s.toString('hex');
  if (isBuffer(opts.g)) opts.g = opts.g.toString('hex');
  if (isBuffer(opts.n)) opts.n = opts.n.toString('hex');
  if (isBuffer(opts.p)) opts.p = opts.p.toString('hex');
  if ('string' === typeof opts.s) opts.s = BigInt(opts.s, 16);
  if ('string' === typeof opts.g) opts.g = BigInt(opts.g, 16);
  if ('string' === typeof opts.n) opts.n = BigInt(opts.n, 16);
  if ('string' === typeof opts.p) opts.p = BigInt(opts.p, 16);

  // For now, we only support 256 bits
  this.bits = opts.bits = 256;

  // Build from already-known private
  if (opts.private) {
    const chars = this.bits / 4; // each char covers 4 bits
    this.n = BigInt(opts.private.substr(0,chars), 16);
    this.g = buildGenerator(this.n, BigInt(2).pow(24));
    this.s = BigInt(opts.private.substr(chars), 16);
    this.p = this.g.modPow(this.s, this.n);
  }

  // Build from already-known public
  if (opts.public && (!opts.private)) {
    const chars = this.bits / 4;
    this.n = opts.public.substr(0,chars);
    this.g = buildGenerator(this.n, BigInt(2).pow(24));
    this.p = opts.public.substr(chars);
  }

  // Build modulo
  if (!this.n) {
    if (opts.n) {
      this.n = opts.n;
    } else {
      Object.assign(this, buildModulo(
        this.bits,
        24
      ));
    }
  }

  // Build group
  if(!this.g) {
    console.log(this.n);
    if (opts.g) {
      this.g = opts.g;
    } else {
      this.g = buildGenerator(this.n, BigInt(2).pow(24));
    }
    console.log(this.g);
  }

  // Generate public/secret
  if (!this.p) {
    if (opts.s) {
      this.s = opts.s;
    } else {
      this.s = buildSecret( this.bits / 2, this.n );
    }
    this.p = this.g.modPow(this.s, this.n);
  }

}

KeyPair.prototype.getPublic = function() {
  let tokenLength = this.bits / 4;
  let prefix      = '0'.repeat(tokenLength);
  let modulo      = (prefix + this.n.toString(16)).substr(-tokenLength);
  let public      = (prefix + this.p.toString(16)).substr(-tokenLength);
  return modulo + public;
}

KeyPair.prototype.sharedSecret = function(kp) {
  if (kp.n.compare(this.n)) return false;
  if (kp.g.compare(this.g)) return false;
  return kp.p.modPow(this.s, this.n);
};

module.exports = KeyPair;
