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

// ———————— Store ——————————
export class BunSQLStore extends Store {
  private db: SQL;
  private ttl: number;

  constructor(options: StoreOptions) {
    super();
    if (!options?.db) throw new Error("BunSQLStore: db instance required");

    this.db = options.db;
    this.ttl = options.ttl ?? 86400; // default 1 jour

    // initialisation DB async (ne pas bloquer le constructeur)
    this.initializeDb().then(() =>
      console.log("✅ SQL session store initialized")
    );
  }

  private async initializeDb() {
    try {
      await this.db`
        CREATE TABLE IF NOT EXISTS sessions (
          sid TEXT PRIMARY KEY,
          expires BIGINT,
          data TEXT,
          created_at BIGINT
        )
      `;
      await this.db`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires)`;
    } catch (err) {
      console.error("❌ Failed to initialize SQL session store:", err);
    }
  }

  // ———————— GET ——————————
  async get(
    sid: string,
    callback: (err: any, session?: SessionData | null) => void
  ): Promise<void> {
    try {
      const rows = await this.db`
        SELECT data FROM sessions
        WHERE sid = ${sid} AND expires > ${Date.now()}
      `.values();

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
      const expires =
        typeof session.cookie.maxAge === "number"
          ? Date.now() + session.cookie.maxAge
          : Date.now() + this.ttl * 1000;

      const data = JSON.stringify(session);
      const createdAt = Date.now();

      await this.db`
        INSERT INTO sessions (sid, expires, data, created_at)
        VALUES (${sid}, ${expires}, ${data}, ${createdAt})
        ON CONFLICT (sid) DO UPDATE
          SET expires = EXCLUDED.expires,
              data = EXCLUDED.data
      `;

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
  async length(
    callback: (err?: any, length?: number) => void
  ): Promise<void> {
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
      const expires =
        typeof session.cookie.maxAge === "number"
          ? Date.now() + session.cookie.maxAge
          : Date.now() + this.ttl * 1000;

      await this.db`UPDATE sessions SET expires = ${expires} WHERE sid = ${sid}`;
      callback();
    } catch (err) {
      callback(err);
    }
  }

  // ———————— PRUNE ——————————
  async prune(): Promise<void> {
    try {
      const result = await this.db.unsafe(`DELETE FROM sessions WHERE expires < ${Date.now()}`);
      console.log(`🧹 Pruned expired sessions (${result.length ?? 0} removed)`);
    } catch (err) {
      console.error("❌ Failed to prune expired sessions:", err);
    }
  }
}

export default BunSQLStore;
