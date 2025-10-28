# bun-sql-session-store
A [bun:sql](https://bun.com/docs/runtime/sql) session store to be used with [express-session](https://github.com/expressjs/session)



## Installation

```bash
bun add bun-sql-session-store 
bun init
```

## Usage

```js
import session from 'express-session';
import BunSQLStore from 'bun-sql-session-store';
import { SQL } from 'bun';

const db = new SQL(process.env.DB_URL);

app.use(session({
  store: new BunSQLStore({
    db,
    ttl: 86400
  }),
  secret: 'your-secret',
  resave: false,
  saveUninitialized: true
}));
