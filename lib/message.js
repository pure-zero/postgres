'use strict';

const util = require('util');

class Message {
  /**
   * @constructor
   * @param {Buffer} buffer 
   */
  constructor(buffer) {
    this.parseHeader(buffer);
  }

  parseHeader(buffer) {
    const header = buffer.toString('utf8', 0, 1);
    console.log('\r\n parseHeader ==>')
    console.log({ header });
    // console.log(buffer.toString('ascii', 9));
    console.log('<== parseHeader \r\n')
    switch (header) {
      case 'R':
        return this.parseR(buffer);
      case 'E':
        return this.parseE(buffer);
    }
  }

  parseR(buffer) {
    console.log('\r\n parseR ===>')
    let offset = 1;
    const length = buffer.readInt32BE(offset);
    offset += 4;

    const code = buffer.readInt32BE(offset);
    offset += 4;

    console.log({
      length,
      code
    });

    switch (code) {
      case 0:
        this.name = 'AuthenticationOk';
        this.message = buffer.toString('ascii', 9);
        break;
      case 3:
        if (msg.length === 8) {
          this.name = 'AuthenticationCleartextPassword';
        } else {
          this.name = `parseR code 3, length expect 8, get ${length}`;
        }
        break;
      case 5:
        if (length === 12) {
          this.name = 'AuthenticationMD5Password';
          this.salt = buffer.slice(offset, offset + 4);
        } else {
          this.name = `parseR code 5, length expect 12, get ${length}`;
        }
        break;
      default:
        throw new Error('Unknown Authentication type' + util.inspect({
          code,
          message: buffer.slice(offset, offset + 4)
        }));
    }
  }

  parseE(buffer) {
    this.name = 'error';
    console.log(buffer.toString('utf8', 0, 1));
    console.log(buffer.indexOf(6, 0));
    const bufferLen = Buffer.byteLength(buffer);
    console.log({ bufferLen });
    console.log(buffer.readUInt32BE(1));
    console.log(buffer.readUInt32LE(1));
    const len = buffer.readInt32LE(1);
    console.log({ len });
    const name = buffer.toString('utf8', 5, 1);
    console.log({ name });
    const message = buffer.toString('ascii', 0, buffer.indexOf(0, 6));
    console.log({ message });
    this.message = message;
  }
}

module.exports = Message