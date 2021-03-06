'use strict';

const Connection = require('./connection');
const Query = require('./query');
const Utils = require('./utils');
const EventEmitter = require('events');

class Client extends EventEmitter {
  #end = false;
  #queryable = false;
  #connecting = false;
  #connected = false;
  #connectionTimeoutMillis = 0;

  /**
   * @constructor
   * @param {Object} config 
   */
  constructor(config) {
    super();
    this.user = config.user;
    this.host = config.host;
    this.database = config.database;
    this.password = config.password;
    this.port = config.port;
    this.ssl = config.ssl;
    this.connection = new Connection(config);
    this.processID = void 0;
    this.secretKey = void 0;
    this.activeQuery = void 0;
    if (typeof config.connectionTimeoutMillis === 'number') {
      this.#connectionTimeoutMillis = config.connectionTimeoutMillis;
    }
  }

  connect() {
    if (this.#connecting || this.#connected) {
      const err = new Error('Client has already been connected. You cannot reuse a client.')
      throw err;
    }
    this.#connecting = true;
    const con = this.connection;

    const connectionTimeoutHandle = this.#connectionTimeoutMillis > 0 ?
      setTimeout(() => {
        this.#end = true;
        con.stream.destroy(new Error('timeout expired'));
      }, this.#connectionTimeoutMillis) : undefined;

    con.connect();

    con.on('AuthenticationMD5Password', msg => {
      // console.log('AuthenticationMD5Password');
      const md5Password = Utils.Md5Password(this.user, this.password, msg.salt);
      con.password(md5Password);
    });

    con.on('AuthenticationCleartextPassword', () => {
      // console.log('AuthenticationCleartextPassword');
      con.password(this.password);
    });

    con.on('AuthenticationOk', message => {
      // console.log('AuthenticationOk', message);
    });

    con.on('ReadyForQuery', msg => {
      // console.log('ReadyForQuery', msg);
      this.#queryable = true;
    });

    con.once('BackendKeyData', msg => {
      this.processID = msg.processID
      this.secretKey = msg.secretKey
    });

    con.on('RowDescription', msg => {
      // console.log('RowDescription', msg);
      this.activeQuery.handleRowDescription(msg);
    });

    con.on('DataRow', msg => {
      // console.log('DataRow', msg);
      this.activeQuery.handleDataRow(msg);
    });

    con.on('error', err => {
      if (this.#queryable) this.#queryable = false;
      this.emit('error', err);
    });

    return new Promise((resolve, reject) => {
      const connectErrorHandler = err => {
        if (connectionTimeoutHandle !== undefined) clearTimeout(connectionTimeoutHandle);
        console.log('connection error:', err);
        reject(err);
      };
      const endHandler = () => {
        const error = new Error(this.#end ? 'Connection terminated' : 'Connection terminated unexpectedly');
        if (connectionTimeoutHandle !== undefined) clearTimeout(connectionTimeoutHandle);
        if (this.#end === false) {
          this.#end = true;
          this.emit('end');
          reject(error);
        }
      };

      con.once('error', connectErrorHandler);
      con.once('end', endHandler);

      con.once('ReadyForQuery', () => {
        this.#connecting = false;
        this.#connected = true;
        if (connectionTimeoutHandle !== undefined) clearTimeout(connectionTimeoutHandle);
        con.removeListener('error', connectErrorHandler);
        con.removeListener('end', endHandler);
        resolve('connected');
      });
    })
  }

  end() {
    if(this.#end) return;
    this.#end = true;
    if (this.activeQuery) {
      this.connection.stream.destroy();
    } else {
      this.connection.end();
    }
    return new Promise((resolve, reject) => {
      this.connection.once('end', resolve);
      this.connection.once('error', reject);
    });
  }

  query(sql) {
    if (!this.#queryable) throw new Error('Client has encountered a connection error and is not queryable');

    if (this.#end) throw new Error('Client was closed and is not queryable');

    const query = new Query();
    this.activeQuery = query;
    this.connection.query(sql);

    return new Promise((resolve, reject) => {
      const queryErrorHandler = err => {
        console.log('query error:', err);
        this.activeQuery = void 0;
        this.connection.removeAllListeners('CommandComplete');
        reject(err);
      };

      this.connection.once('CommandComplete', msg => {
        // console.log('CommandComplete', msg);
        this.connection.removeListener('error', queryErrorHandler);
        query.handleCommandComplete(msg);
        resolve(query);
      });

      this.connection.once('error', queryErrorHandler);
    })
  }

  cancel() {
    const con = this.connection;

    if (this.host && this.host.indexOf('/') === 0) {
      con.connect(this.host + '/.s.PGSQL.' + this.port);
    } else {
      con.connect(this.port, this.host);
    }

    con.once('connect', function () {
      con.cancel(this.processID, this.secretKey);
    })
  }
}

module.exports = Client