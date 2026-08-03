import os from "node:os";
import path from "node:path";

export function heliosHome(env = process.env) {
  return path.resolve(env.HELIOS_HOME || path.join(os.homedir(), ".helios"));
}

export function paths(env = process.env) {
  const home = heliosHome(env);
  return {
    home,
    config: path.join(home, "config.json"),
    database: path.join(home, "helios.db"),
    memory: path.join(home, "memory.md"),
    capabilities: path.join(home, "capabilities"),
    logs: path.join(home, "logs"),
  };
}
