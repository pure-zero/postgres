'use strict';

const net = require('net');
const Writer = require('./writer');
const Reader = require('./reader');
const Message = require('./message');
const EventEmitter = require('events');

class Connection extends EventEmitter {
  #end = false;
  #reader = void 0;

  constructor(config) {
    super();
    this.user = config.user;
    this.host = config.host;
    this.database = config.database;
    this.port = config.port;
    this.ssl = config.ssl;
    this.stream = new net.Socket();
    /**
     * Disables the Nagle algorithm. By default TCP connections use the Nagle algorithm, 
     * they buffer data before sending it off. Setting true for noDelay will immediately 
     * fire off data each time socket.write() is called.
     */
    // this.stream.setNoDelay(true);
    this.keepAlive = config.keepAlive || false;
    this.keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis || 0;
  }

  connect() {
    this.stream.connect({
      host: this.host,
      port: this.port
    });

    this.stream.on('connect', () => {
      if (this.keepAlive) {
        this.stream.setKeepAlive(true, this.keepAliveInitialDelayMillis);
      }

      if (this.ssl) return this.requestSsl();
      this.startup();
    });

    const reportStreamError = error => {
      if (this.#end) return;
      if (error.code === 'ECONNRESET' || error.code === 'EPIPE') return;
      this.emit('error', error);
    };

    this.stream.on('error', reportStreamError);

    this.stream.on('close', () => {
      this.emit('end');
    });

    if (!this.ssl) return this.attachListeners();

    this.stream.once('data', buffer => {
      const responseCode = buffer.toString('utf8');
      switch (responseCode) {
        case 'S': // Server supports SSL connections, continue with a secure connection
          break;
        case 'N': // Server does not support SSL connections
          this.stream.end();
          return this.emit('error', new Error('Server does not support SSL connections'));
        default: // Any other response byte, including 'E' (ErrorResponse) indicating a server error
          this.stream.end();
          return this.emit('error', new Error('There was an error establishing an SSL connection'))
      }
      const tls = require('tls');
      const options = {
        /**
         * When enabled, TLS packet trace information is written to stderr. 
         * This can be used to debug TLS connection problems.
         */
        // enableTrace: true,
        socket: this.stream,
        allowHalfOpen: this.ssl.allowHalfOpen || false,
        rejectUnauthorized: this.ssl.rejectUnauthorized || false,
        ALPNProtocols: this.ssl.ALPNProtocols,
        checkServerIdentity: this.ssl.checkServerIdentity || tls.checkServerIdentity,
        minDHSize: this.ssl.minDHSize || 1024,
        ca: this.ssl.ca,
        cert: this.ssl.cert,
        key: this.ssl.key,
        passphrase: this.ssl.passphrase,
        pfx: this.ssl.pfx,
        secureContext: this.ssl.secureContext,
        secureOptions: this.ssl.secureOptions,
        secureProtocol: this.ssl.secureProtocol,
        NPNProtocols: this.ssl.NPNProtocols
      };

      if (net.isIP(this.host) === 0) options.servername = this.host;
      this.stream = tls.connect(options);
      this.stream.on('error', reportStreamError);
      this.attachListeners();
      this.startup();
    });
  }

  startup() {
    const body = {
      user: this.user,
      database: this.database,
      client_encoding: "'utf-8'"
    };

    const size = Writer.getSize(8, body);

    const writer = new Writer(size);
    writer.writeInt32(size);
    writer.writeInt16(3);
    writer.writeInt16(0);
    writer.writeBody(body);

    this.stream.write(writer.buffer);
  }

  password(password) {
    const passwordLen = Buffer.byteLength(password);
    const size = 1 + 4 + passwordLen + 1; // Byte1('p') + Int32 + String + 1(null terminator)

    const writer = new Writer(size);
    writer.writeHeader('p');
    writer.writeInt32(size - 1);
    writer.writeStr(password, passwordLen);

    this.stream.write(writer.buffer);
  }

  query(sql) {
    const sqlLen = Buffer.byteLength(sql);
    const size = 1 + 4 + sqlLen + 1; // Byte1('Q') + Int32 + String + 1(null terminator)

    const writer = new Writer(size);
    writer.writeHeader('Q');
    writer.writeInt32(size - 1);
    writer.writeStr(sql, sqlLen);

    this.stream.write(writer.buffer);
  }

  end() {
    this.#end = true;
    const buffer = Buffer.alloc(5);

    buffer.write('X');
    buffer.writeInt32BE(4, 1);

    return this.stream.write(buffer, () => {
      this.stream.end();
    });
  }

  requestSsl() {
    // warn: no null terminator
    const size = 8;
    const writer = new Writer(size);
    writer.writeInt32(size);
    writer.writeInt16(1234);
    writer.writeInt16(5679);
    this.stream.write(writer.buffer);
  }

  attachListeners() {
    this.stream.on('data', buffer => {
      this.#reader = new Reader();
      this.#reader.addChunk(buffer);

      let chunk = this.#reader.read();
      while (chunk) {
        const message = new Message({
          chunk,
          length: this.#reader.length,
          header: this.#reader.header
        });
        // console.log(message);
        // console.log(message.name);

        this.emit(message.name, message);

        chunk = this.#reader.read();
      }
    });

    this.stream.on('end', () => {
      this.emit('end');
    });
  }
}

module.exports = Connection