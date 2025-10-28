import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'bun:sqlite'
import { SQLiteStore } from '../src/store'

describe('SQLiteStore', () => {
  let store;
  let db;

  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
    store = new SQLiteStore({ db });
  });

  describe('constructor', () => {
    it('should initialize with default TTL', () => {
      expect(store.ttl).toBe(86400);
    });

    it('should accept custom TTL', () => {
      const customDb = new DatabaseSync(':memory:');
      store = new SQLiteStore({ db: customDb, ttl: 3600 });
      expect(store.ttl).toBe(3600);
      customDb.close();
    });
  });

  describe('session operations', () => {
    it('should set and get session', () => {
      const session = {
        cookie: { maxAge: 3600000 },
        user: { id: 1 }
      };

      store.set('123', session, (err) => {
        expect(err).toBeUndefined();

        store.get('123', (err, data) => {
          expect(err).toBeNull();
          expect(data).toEqual(session);
        });
      });
    });

    it('should destroy session', () => {
      const session = {
        cookie: { maxAge: 3600000 },
        user: { id: 1 }
      };

      store.set('123', session, () => {
        store.destroy('123', (err) => {
          expect(err).toBeUndefined();

          store.get('123', (err, data) => {
            expect(err).toBeUndefined();
            expect(data).toBeUndefined();
          });
        });
      });
    });

    it('should clear all sessions', () => {
      const session = {
        cookie: { maxAge: 3600000 },
        user: { id: 1 }
      };

      store.set('123', session, () => {
        store.clear((err) => {
          expect(err).toBeUndefined();

          store.length((err, length) => {
            expect(err).toBeNull();
            expect(length).toBe(0);
          });
        });
      });
    });
  })
})