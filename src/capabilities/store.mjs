import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const NAME_LIMIT = 60;
const TEXT_LIMIT = 12_000;

export function capabilitySlug(name) {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  if (!slug) throw new Error("Capability name must contain letters or numbers.");
  return slug;
}

function validate(capability) {
  for (const key of ["name", "description", "trigger", "instructions", "verification"]) {
    if (typeof capability[key] !== "string" || !capability[key].trim()) throw new Error(`Capability ${key} is required.`);
    if (capability[key].length > TEXT_LIMIT) throw new Error(`Capability ${key} is too long.`);
  }
  if (capability.name.length > NAME_LIMIT) throw new Error("Capability name is too long.");
}

export class CapabilityStore {
  constructor(directory) { this.directory = directory; }
  async list() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.directory, { withFileTypes: true });
    const capabilities = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try { capabilities.push(JSON.parse(await readFile(path.join(this.directory, entry.name, "capability.json"), "utf8"))); }
      catch { /* An incomplete directory is not an active capability. */ }
    }
    return capabilities.sort((a, b) => a.name.localeCompare(b.name));
  }
  async get(slug) {
    const safe = capabilitySlug(slug);
    try { return JSON.parse(await readFile(path.join(this.directory, safe, "capability.json"), "utf8")); }
    catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  }
  async create(input) {
    const capability = {
      version: 1,
      id: capabilitySlug(input.name),
      name: input.name.trim(), description: input.description.trim(), trigger: input.trigger.trim(),
      instructions: input.instructions.trim(), verification: input.verification.trim(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), uses: 0, revision: 1, history: [],
    };
    validate(capability);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const target = path.join(this.directory, capability.id);
    const temporary = path.join(this.directory, `.${capability.id}-${process.pid}-${Date.now()}`);
    await mkdir(temporary, { mode: 0o700 });
    await writeFile(path.join(temporary, "capability.json"), `${JSON.stringify(capability, null, 2)}\n`, { mode: 0o600 });
    await rm(target, { recursive: true, force: true });
    await rename(temporary, target);
    return capability;
  }
  async recordUse(capability) {
    capability.uses = Number(capability.uses || 0) + 1;
    capability.updatedAt = new Date().toISOString();
    await writeFile(path.join(this.directory, capability.id, "capability.json"), `${JSON.stringify(capability, null, 2)}\n`, { mode: 0o600 });
  }
  async improve(slug, input) {
    const current = await this.get(slug);
    if (!current) return null;
    const next = {
      ...current,
      description: input.description.trim(), trigger: input.trigger.trim(),
      instructions: input.instructions.trim(), verification: input.verification.trim(),
      revision: Number(current.revision || 1) + 1,
      updatedAt: new Date().toISOString(),
      history: [...(current.history || []), {
        revision: current.revision || 1, description: current.description, trigger: current.trigger,
        instructions: current.instructions, verification: current.verification, changedAt: new Date().toISOString(),
        reason: input.reason.trim(), evidence: input.evidence.trim(),
      }].slice(-10),
    };
    validate(next);
    await writeFile(path.join(this.directory, current.id, "capability.json"), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    return next;
  }
  async remove(slug) {
    const safe = capabilitySlug(slug);
    const current = await this.get(safe);
    if (!current) return false;
    await rm(path.join(this.directory, safe), { recursive: true });
    return true;
  }
}
