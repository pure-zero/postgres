'use strict';

const util = require('util');
const TEXT_MODE = 0;
const BINARY_MODE = 1;

class Message {
  #chunk;
  #length;
  #header;
  #offset = 0;
  #mode = TEXT_MODE;

  /**
   * @constructor
   * @param {Buffer} chunk 
   * @param {Number} length 
   * @param {String} buffer 
   */
  constructor({ chunk, length, header }) {
    // console.log({ chunk, length, header });
    this.#chunk = chunk;
    this.#length = length;
    this.#header = header;
    this.parseMessage();
  }

  parseMessage() {
    switch (this.#header) {
      case 'R':
        return this.parseR();
      case 'E':
        return this.parseE();
      case 'T':
        return this.parseT();
      case 'S':
        return this.parseS();
      case 'K':
        return this.parseK();
      case 'Z':
        return this.parseZ();
      case 'D':
        return this.parseD();
      case 'C':
        return this.parseC();
      default:
        throw new Error(`Unprocessed header: ${this.#header}`);
    }
  }

  /**
   * CommandComplete
   * Identifies the message as a command-completed response
   */
  parseC() {
    this.name = 'CommandComplete';
    this.text = this.readZeroString();
  }

  /**
   * DataRow 
   * Identifies the message as a data row.
   */
  parseD() {
    this.name = 'DataRow';
    const fieldCount = this.readInt16();
    const fields = [];

    for (let i = 0; i < fieldCount; i++) {
      const length = this.readInt32();
      if (length === -1) {
        fields.push(null);
      } else if (this.#mode === TEXT_MODE) {
        fields.push(this.readString(length));
      } else {
        fields.push(this.readBytes(length));
      }
    }

    this.fields = fields;
  }

  /**
   * ReadyForQuery
   * Identifies the message type. 
   * ReadyForQuery is sent whenever the backend is ready for a new query cycle.
   */
  parseZ() {
    this.name = 'ReadyForQuery';
    /**
     * Current backend transaction status indicator. 
     * Possible values are 'I' if idle (not in a transaction block); 
     * 'T' if in a transaction block; 
     * or 'E' if in a failed transaction block (queries will be rejected until block is ended).
     */
    this.status = this.readString(1);
  }

  /**
   * 
   * Identifies the message as cancellation key data. 
   * The frontend must save these values if it wishes to be able to issue CancelRequest messages later.
   */
  parseK() {
    this.name = 'BackendKeyData';
    this.processID = this.readInt32();
    this.secretKey = this.readInt32();
  }

  /**
   * ParameterStatus 
   * Identifies the message as a run-time parameter status report
   */
  parseS() {
    this.name = 'ParameterStatus';
    this.parameterName = this.readZeroString();
    this.parameterValue = this.readZeroString();
  }

  /**
   * Authentication related
   * Identifies the message as an authentication request
   */
  parseR() {
    const code = this.readInt32();

    switch (code) {
      case 0:
        this.name = 'AuthenticationOk';
        this.message = this.#chunk.toString('ascii');
        break;
      case 3:
        if (this.#length === 8) {
          this.name = 'AuthenticationCleartextPassword';
        } else {
          this.name = `parseR code 3, length expect 8, get ${ this.#length }`;
        }
        break;
      case 5:
        if (this.#length === 12) {
          this.name = 'AuthenticationMD5Password';
          this.salt = this.#chunk.slice(this.#offset, this.#offset + 4);
        } else {
          this.name = `parseR code 5, length expect 12, get ${ this.#length }`;
        }
        break;
      default:
        throw new Error('Unknown Authentication type' + util.inspect({
          code,
          message: this.#chunk.slice(this.#offset, this.#offset + 4)
        }));
    }
  }

  /**
   * RowDescription 
   * Identifies the message as a row description
   */
  parseT() {
    this.name = 'RowDescription';

    const fieldCount = this.readInt16();

    const fields = [];
    for(let i = 0; i< fieldCount; i++) {
      const name = this.readZeroString();
      const tableID = this.readInt32();
      const columnID = this.readInt16();
      const dataTypeID = this.readInt32();
      const dataTypeSize = this.readInt16();
      const dataTypeModifier = this.readInt32();
      const mode = this.readInt16();
      this.#mode = mode === TEXT_MODE ? TEXT_MODE : BINARY_MODE;
      // Currently will be zero (text) or one (binary).
      const format = mode === TEXT_MODE ? 'text' : 'binary'; 

      fields.push({
        name,
        tableID,
        columnID,
        dataTypeID,
        dataTypeSize,
        dataTypeModifier,
        format
      });
    }

    this.fields = fields;
    // console.log(fields);
  }

  /**
   * ErrorResponse 
   * Identifies the message as an error
   */
  parseE() {
    this.name = 'error';

    const fields = {};

    let fieldType = this.readString(1);
    console.log({ fieldType });

    while (fieldType !== '\0') {
      fields[fieldType] = this.readZeroString();
      fieldType = this.readString(1);
    }
    console.log({ fields });

    this.message = fields.M;
    this.severity = fields.S;
    this.code = fields.C;
    this.detail = fields.D;
    this.hint = fields.H;
    this.position = fields.P;
    this.internalPosition = fields.p;
    this.internalQuery = fields.q;
    this.where = fields.W;
    this.schema = fields.s;
    this.table = fields.t;
    this.column = fields.c;
    this.dataType = fields.d;
    this.constraint = fields.n;
    this.file = fields.F;
    this.line = fields.L;
    this.routine = fields.R;
  }

  readInt16() {
    const value = this.#chunk.readInt16BE(this.#offset);
    this.#offset += 2;

    return value
  }

  readInt32() {
    const value = this.#chunk.readInt32BE(this.#offset);
    this.#offset += 4;

    return value
  }

  /**
   * @param {Number} length
   */
  readString(length) {
    return this.#chunk.toString('utf8', this.#offset, this.#offset += length)
  }

  /**
   * @param {Number} length
   */
  readBytes(length) {
    return this.#chunk.slice(this.#offset, this.#offset += length)
  }

  readZeroString() {
    const start = this.#offset;
    const end = this.#chunk.indexOf(0, start);
    this.#offset = end + 1;
    return this.#chunk.toString('utf8', start, end)
  }
}

module.exports = Message