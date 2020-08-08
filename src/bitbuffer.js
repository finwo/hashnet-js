class BitBuffer extends Array {
  constructor(...args) {
    super(...args);
    this.fill(0);
  }

  static fromBuffer(source) {
    let result = new BitBuffer(source.length * 8).fill(0);
    [...source].forEach((a,i) => {
      result[(i*8)+0] = Math.floor((a>>7)%2);
      result[(i*8)+1] = Math.floor((a>>6)%2);
      result[(i*8)+2] = Math.floor((a>>5)%2);
      result[(i*8)+3] = Math.floor((a>>4)%2);
      result[(i*8)+4] = Math.floor((a>>3)%2);
      result[(i*8)+5] = Math.floor((a>>2)%2);
      result[(i*8)+6] = Math.floor((a>>1)%2);
      result[(i*8)+7] = Math.floor((a>>0)%2);
    });
    return result;
  }

  shiftUint(bits) {
    if (undefined === bits) {
      bits = 1;
    }

    let output = 0;
    while(bits--) {
      output *= 2;
      output += this.shift() || 0;
    }

    return output;
  }

  toBuffer() {
    let copy   = BitBuffer.from(this);
    let result = Buffer.alloc(Math.ceil(copy.length / 8));
    let index  = 0;
    for(let i=0; i<result.length; i++) {
      result[i] = copy.shiftUint(8);
    }
    return result;
  }
}

module.exports = BitBuffer;
