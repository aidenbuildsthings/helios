import { mkdir } from "node:fs/promises";
import { paths } from "./paths.mjs";
import { Memory } from "./memory.mjs";

export class Store {
  constructor(env = process.env, config = {}) {
    this.locations = paths(env);
    this.memoryStore = new Memory({ config, locations: this.locations });
    this.db = null;
  }

  async open() {
    await mkdir(this.locations.home, { recursive: true, mode: 0o700 });
    const { DatabaseSync } = await import("node:sqlite");
    this.db = new DatabaseSync(this.locations.database);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_session_id ON messages(session_id, id);
    `);
    await this.memoryStore.initialize();
    return this;
  }

  ensureSession(id, title = "New conversation") {
    const now = new Date().toISOString();
    this.db.prepare("INSERT OR IGNORE INTO sessions(id,title,created_at,updated_at) VALUES(?,?,?,?)")
      .run(id, title, now, now);
  }

  append(id, message) {
    this.ensureSession(id);
    const now = new Date().toISOString();
    this.db.prepare("INSERT INTO messages(session_id,role,content,created_at) VALUES(?,?,?,?)")
      .run(id, message.role, JSON.stringify(message), now);
    this.db.prepare("UPDATE sessions SET updated_at=? WHERE id=?").run(now, id);
  }

  messages(id) {
    return this.db.prepare("SELECT role,content FROM messages WHERE session_id=? ORDER BY id")
      .all(id).map((row) => JSON.parse(row.content));
  }

  sessions(limit = 20) {
    return this.db.prepare("SELECT id,title,updated_at FROM sessions ORDER BY updated_at DESC LIMIT ?")
      .all(limit);
  }

  async memory() { return (await this.memoryStore.snapshot()).memory; }
  async instructions() { return (await this.memoryStore.snapshot()).instructions; }

  async remember(text) {
    return this.memoryStore.remember(text);
  }

  async log(role, text) { return this.memoryStore.log(role, text); }

  close() { this.db?.close(); }
}
