import { Store, SessionData as ExpressSessionData } from "express-session";
import { SQL } from "bun";

interface Cookie {
  originalMaxAge: number | null;
  maxAge?: number;
  signed?: boolean;
  expires?: Date | null;
  httpOnly?: boolean;
  path?: string;
  domain?: string;
  secure?: boolean | "auto";
  sameSite?: boolean | "lax" | "strict" | "none";
}

interface SessionData extends ExpressSessionData {
  cookie: Cookie;
  [key: string]: any;
}

interface StoreOptions {
  db: SQL;
  ttl?: number;
}

interface SessionRow {
  sid: string;
  expires: number;
  data: string;
  count?: number;
}

// Track initialization to avoid duplicate attempts
let isInitialized = false;
let initPromise: Promise<void> | null = null;

// ———————— Store ——————————
export class BunSQLStore extends Store {
  private db: SQL;
  private ttl: number;

  constructor(options: StoreOptions) {
    super();
    if (!options?.db) throw new Error("BunSQLStore: db instance required");

    this.db = options.db;
    this.ttl = options.ttl ?? 86400;

    // Only initialize once across all instances
    if (!isInitialized && !initPromise) {
      initPromise = this.initializeDb()
        .then(() => {
          isInitialized = true;
          console.log("✅ SQL session store initialized");
        })
        .catch(err => {
          console.error("❌ Failed to initialize SQL session store:", err);
          // Reset so it can be retried
          initPromise = null;
        });
    }
  }

  private async initializeDb() {
    // Silently try to create table/index - ignore errors if they already exist
    try {
      await this.db`CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, expires BIGINT, data TEXT, created_at BIGINT)`;
    } catch (e: any) {
      // Ignore "already exists" errors
      if (!e.message?.includes('already exists')) throw e;
    }
    
    try {
      await this.db`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires)`;
    } catch (e: any) {
      // Ignore "already exists" errors
      if (!e.message?.includes('already exists')) throw e;
    }
  }

  // ———————— GET ——————————
  async get(
    sid: string,
    callback: (err: any, session?: SessionData | null) => void
  ): Promise<void> {
    try {
      const now = Date.now();
      const rows = await this.db`SELECT data FROM sessions WHERE sid = ${sid} AND expires > ${now}`.values();

      if (!rows.length) return callback(null, null);

      const data = JSON.parse(rows[0][0]);
      return callback(null, data);
    } catch (err) {
      return callback(err);
    }
  }

  // ———————— SET ——————————
  async set(
    sid: string,
    session: SessionData,
    callback: (err?: any) => void
  ): Promise<void> {
    try {
      const now = Date.now();
      const maxAge = typeof session.cookie.maxAge === "number" 
        ? session.cookie.maxAge 
        : this.ttl * 1000;
      const expires = now + maxAge;
      const data = JSON.stringify(session);
      const createdAt = now;

      await this.db`INSERT INTO sessions (sid, expires, data, created_at) VALUES (${sid}, ${expires}, ${data}, ${createdAt}) ON CONFLICT (sid) DO UPDATE SET expires = EXCLUDED.expires, data = EXCLUDED.data`;

      callback();
    } catch (err) {
      callback(err);
    }
  }

  // ———————— DESTROY ——————————
  async destroy(sid: string, callback: (err?: any) => void): Promise<void> {
    try {
      await this.db`DELETE FROM sessions WHERE sid = ${sid}`;
      callback();
    } catch (err) {
      callback(err);
    }
  }

  // ———————— CLEAR ——————————
  async clear(callback: (err?: any) => void): Promise<void> {
    try {
      await this.db`DELETE FROM sessions`;
      callback();
    } catch (err) {
      callback(err);
    }
  }

  // ———————— LENGTH ——————————
  async length(callback: (err?: any, length?: number) => void): Promise<void> {
    try {
      const rows = await this.db`SELECT COUNT(*) FROM sessions`.values();
      const count = parseInt(rows[0][0], 10) || 0;
      callback(null, count);
    } catch (err) {
      callback(err);
    }
  }

  // ———————— TOUCH ——————————
  async touch(
    sid: string,
    session: SessionData,
    callback: (err?: any) => void
  ): Promise<void> {
    try {
      const now = Date.now();
      const maxAge = typeof session.cookie.maxAge === "number" 
        ? session.cookie.maxAge 
        : this.ttl * 1000;
      const expires = now + maxAge;

      await this.db`UPDATE sessions SET expires = ${expires} WHERE sid = ${sid}`;
      callback();
    } catch (err) {
      callback(err);
    }
  }

  // ———————— PRUNE ——————————
  async prune(): Promise<void> {
    try {
      const now = Date.now();
      const result = await this.db`DELETE FROM sessions WHERE expires < ${now}`;
      console.log(`🧹 Pruned expired sessions (${result.count ?? 0} removed)`);
    } catch (err: any) {
      // Don't log if it's just a prepared statement issue during concurrent calls
      if (!err.message?.includes('already exists') && !err.message?.includes('does not exist')) {
        console.error("❌ Failed to prune expired sessions:", err);
      }
    }
  }
}

export default BunSQLStore;