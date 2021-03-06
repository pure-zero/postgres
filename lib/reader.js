'use strict';

class Reader {
  /**
   * @constructor
   * @param {Object} options
   */
  constructor(options = {}) {
    this.offset = 0;
    this.chunk = void 0;
    this.chunkLength = 0;
    this.headerSize = options.headerSize || 1;
    this.lengthSize = options.lengthSize || 4;
    this.header = void 0;
    this.length = void 0;
  }

  /**
   * @param {Buffer} chunk 
   */
  addChunk(chunk) {
    if (!this.chunk) {
      this.chunk = chunk;
      this.chunkLength = Buffer.byteLength(chunk);
      this.offset = 0;
      return
    }

    this.chunk = Buffer.concat([this.chunk, chunk]);
    this.chunkLength += Buffer.byteLength(chunk);
  }

  /**
   * @returns {Buffer}
   */
  read() {
    if (this.chunkLength < (this.headerSize + this.lengthSize + this.offset)) return false;

    if (this.headerSize) this.header = this.chunk.toString('utf8', this.offset, this.offset + this.headerSize);
    this.offset += this.headerSize;

    this.length = this.chunk.readInt32BE(this.offset);
    const remaining = this.chunkLength - this.offset;
    if (this.length > remaining) return false;

    const result = this.chunk.slice(this.offset + this.lengthSize, this.offset + this.length);
    this.offset += this.length;

    return result
  }
}

module.exports = Reader