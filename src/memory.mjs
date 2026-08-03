import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const readOptional = async (file) => {
  try { return await readFile(file, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return ""; throw error; }
};

export class Memory {
  constructor({ config, locations }) {
    const obsidian = config.memory?.backend === "obsidian" ? config.memory.obsidian : null;
    this.root = obsidian ? path.resolve(obsidian.vaultPath, obsidian.folder || "Helios") : locations.home;
    this.memoryFile = obsidian ? path.join(this.root, obsidian.memoryNote || "Memory.md") : locations.memory;
    this.instructionsFile = path.join(this.root, obsidian?.instructionsNote || "Instructions.md");
    this.logs = obsidian ? path.join(this.root, obsidian.logsFolder || "Logs") : null;
  }

  async initialize() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if (this.logs) await mkdir(this.logs, { recursive: true, mode: 0o700 });
    if (!(await readOptional(this.memoryFile))) await writeFile(this.memoryFile, "# Helios Memory\n\n", { mode: 0o600 });
    if (!(await readOptional(this.instructionsFile))) await writeFile(this.instructionsFile, "# Helios Instructions\n\nAdd durable instructions for Helios here.\n", { mode: 0o600 });
    return this;
  }

  async snapshot() {
    return { memory: await readOptional(this.memoryFile), instructions: await readOptional(this.instructionsFile) };
  }

  async remember(text) {
    const entry = `- ${new Date().toISOString().slice(0, 10)}: ${text.trim()}\n`;
    await appendFile(this.memoryFile, entry, { mode: 0o600 });
    return entry.trim();
  }

  async log(role, text) {
    if (!this.logs || !text?.trim()) return;
    const day = new Date().toISOString().slice(0, 10);
    await appendFile(path.join(this.logs, `${day}.md`), `\n## ${new Date().toISOString()} · ${role}\n\n${text.trim()}\n`, { mode: 0o600 });
  }
}
