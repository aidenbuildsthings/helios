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
      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, instructions TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, expression TEXT NOT NULL, prompt TEXT NOT NULL,
        worker_id TEXT REFERENCES workers(id) ON DELETE SET NULL, enabled INTEGER NOT NULL DEFAULT 1,
        last_slot TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, source TEXT NOT NULL,
        sha256 TEXT NOT NULL, content TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, installed_at TEXT NOT NULL
      );
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

  workers() { return this.db.prepare("SELECT * FROM workers ORDER BY name").all(); }
  worker(id) { return this.db.prepare("SELECT * FROM workers WHERE id=?").get(id) || null; }
  saveWorker({ id, name, instructions }) {
    const now = new Date().toISOString();
    this.db.prepare("INSERT INTO workers(id,name,instructions,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,instructions=excluded.instructions,updated_at=excluded.updated_at").run(id, name, instructions, now, now);
  }
  removeWorker(id) { return this.db.prepare("DELETE FROM workers WHERE id=?").run(id).changes > 0; }
  cronJobs() { return this.db.prepare("SELECT * FROM cron_jobs ORDER BY name").all(); }
  saveCronJob({ id, name, expression, prompt, workerId = null }) {
    const now = new Date().toISOString();
    this.db.prepare("INSERT INTO cron_jobs(id,name,expression,prompt,worker_id,enabled,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)").run(id, name, expression, prompt, workerId, now, now);
  }
  markCronRun(id, slot) { this.db.prepare("UPDATE cron_jobs SET last_slot=?,updated_at=? WHERE id=?").run(slot, new Date().toISOString(), id); }
  removeCronJob(id) { return this.db.prepare("DELETE FROM cron_jobs WHERE id=?").run(id).changes > 0; }
  skills() { return this.db.prepare("SELECT id,name,description,source,sha256,enabled,installed_at FROM skills ORDER BY name").all(); }
  skill(id) { return this.db.prepare("SELECT * FROM skills WHERE id=? AND enabled=1").get(id) || null; }
  saveSkill(skill) { this.db.prepare("INSERT INTO skills(id,name,description,source,sha256,content,enabled,installed_at) VALUES(?,?,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,source=excluded.source,sha256=excluded.sha256,content=excluded.content,enabled=1,installed_at=excluded.installed_at").run(skill.id, skill.name, skill.description, skill.source, skill.sha256, skill.content, new Date().toISOString()); }
  removeSkill(id) { return this.db.prepare("DELETE FROM skills WHERE id=?").run(id).changes > 0; }

  async memory() { return (await this.memoryStore.snapshot()).memory; }
  async instructions() { return (await this.memoryStore.snapshot()).instructions; }

  async remember(text) {
    return this.memoryStore.remember(text);
  }

  async log(role, text) { return this.memoryStore.log(role, text); }

  close() { this.db?.close(); }
}
