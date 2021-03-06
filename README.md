# postgres
PostgreSQL client for node.js.  

## Install

```sh
$ npm i node-postgres
```

### Status
* [x] client
* [x] pool
* [x] ssl
* [x] end
* [x] transactions

## Useage  

### Client 

```js
const { Client } = require('node-postgres');

(async () => {
  const client = new Client({
    user: 'postgres',
    host: '127.0.0.1',
    database: 'test',
    password: 'esri@123',
    port: 5432
  });
  
  await client.connect();

  const res = await client.query('SELECT * from users');
  console.log(res);
  await client.end();
})().catch(console.error);
```  

### ssl 
```js
const { Client, Pool } = require('node-postgres');
const fs = require('fs');

(async () => {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'test',
    password: 'esri@123',
    port: 5432,
    ssl: {
      rejectUnauthorized: false,
      // ca: fs.readFileSync('c:/my/server.crt').toString(),
      key: fs.readFileSync('c:/my/server.key').toString(),
      cert: fs.readFileSync('c:/my/server.crt').toString(),
    }
  });
  
  await client.connect();
  
  const res = await client.query('SELECT * from users');
  console.log(res);
  await client.end();
})().catch(console.error);
```  

### Pool
The client pool allows you to have a reusable pool of clients you can check out, use, and return. You generally want a limited number of these in your application and usually just 1. Creating an unbounded number of pools defeats the purpose of pooling at all.

#### Checkout, use, and return
```js
const { Pool } = require('node-postgres');

(async () => {
  const pool = new Pool({
    user: 'postgres',
    host: '127.0.0.1',
    database: 'test',
    password: 'esri@123',
    port: 5432
  });
  
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT * from users');
    console.log(res);
  } catch (error) {
    console.log(error);
  } finally {
    client.release();
  }
})().catch(console.error);
```
You must always return the client to the pool if you successfully check it out, regardless of whether or not there was an error with the queries you ran on the client. If you don't check in the client your application will leak them and eventually your pool will be empty forever and all future requests to check out a client from the pool will wait forever.

#### Single query
If you don't need a transaction or you just need to run a single query, the pool has a convenience method to run a query on any available client in the pool. This is the preferred way to query with node-postgres if you can as it removes the risk of leaking a client.
```js
const { Pool } = require('node-postgres');

(async () => {
  const pool = new Pool({
    user: 'postgres',
    host: '127.0.0.1',
    database: 'test',
    password: 'esri@123',
    port: 5432
  });
  
  const res = await pool.query('SELECT * from users');
  console.log(res);
})().catch(console.error);
```

### Transation
To execute a transaction with node-postgres you simply execute BEGIN / COMMIT / ROLLBACK queries yourself through a client. Because node-postgres strives to be low level and un-opinionated, it doesn't provide any higher level abstractions specifically around transactions.

You must use the same client instance for all statements within a transaction. PostgreSQL isolates a transaction to individual clients. This means if you initialize or use transactions with the pool.query method you will have problems. Do not use transactions with the pool.query method.

```js
const { Pool } = require('node-postgres');
const pool = new Pool({
  user: 'postgres',
  host: '127.0.0.1',
  database: 'test',
  password: 'esri@123',
  port: 5432
});

(async () => {
  // note: we don't try/catch this because if connecting throws an exception
  // we don't need to dispose of the client (it will be undefined)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`INSERT INTO users(id, name) VALUES(1, 'zfx')`);
    await client.query(`INSERT INTO users(id, name) VALUES(2, 'zfx2')`);
    await client.query(`DELETE FROM users WHERE id=0`);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
})().catch(console.error);
```

### Shutdown
To shut down a pool call pool.end() on the pool. This will wait for all checked-out clients to be returned and then shut down all the clients and the pool timers.
```js
const { Pool } = require('node-postgres');

(async () => {
  const pool = new Pool({
    user: 'postgres',
    host: '127.0.0.1',
    database: 'test',
    password: 'esri@123',
    port: 5432
  });
  
  const res = await pool.query('SELECT * from users');
  console.log(res);
  await pool.end()
  // will throw error
  await pool.query('SELECT * from users');
})().catch(console.error);
```
The pool will return errors when attempting to check out a client after you've called `pool.end()` on the pool.

## constructor
### client constructor options
```ts
import http = require('http');
import https = require('https');

interface Options {
  user: string,
  password: string,
  database: string, 
  port: number, 
  // passed directly to node.TLSSocket, supports all tls.connect options
  ssl?: any, 
  // number of milliseconds to wait before timing out when connecting a new client
  // by default this is 0 which means no timeout
  connectionTimeoutMillis?: int,
}
```  

### pool constructor options
Every field of the config object is entirely optional. The config passed to the pool is also passed to every client instance within the pool when the pool creates that client.
```ts
interface Options {
  // all valid client config options are also valid here
  // in addition here are the pool specific configuration parameters:

  // number of milliseconds a client must sit idle in the pool and not be checked out
  // before it is disconnected from the backend and discarded
  // default is 10000 (10 seconds) - set to 0 to disable auto-disconnection of idle clients
  idleTimeoutMillis?: int,
  // maximum number of clients the pool should contain
  // by default this is set to 10.
  max?: int,
  // Determines the pool's action when no connections are available and the limit has 
  // been reached. If true, the pool will queue the connection request and call it 
  // when one becomes available. If false, the pool will immediately call back with 
  // an error. (Default: true)
  waitForConnections?: boolean, 
  // number of milliseconds to wait before timing out when waiting for connection.
  // by default this is 0 which means no timeout
  waitForConnectionsMillis?: int, 
  // The maximum number of connection requests the pool will queue before returning 
  // an error from getConnection. If set to 0, there is no limit to the number of 
  // queued connection requests. (Default: 0)
  queueLimit?: int,
}
```

## Test

```bash
$ npm test
```  