import { execFile, spawn } from "node:child_process";
import { chmod, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { paths } from "./paths.mjs";

const execFileAsync = promisify(execFile);

export function processExists(pid) {
  if (!Number.isInteger(pid) || pid < 2) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

export async function readRuntime(env = process.env) {
  try { return JSON.parse(await readFile(paths(env).runtime, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return null; throw new Error(`Helios runtime record is invalid: ${error.message}`); }
}

export async function registerRuntime({ cliPath, env = process.env, pid = process.pid }) {
  const locations = paths(env); const existing = await readRuntime(env);
  if (existing?.pid !== pid && processExists(existing?.pid)) throw new Error(`Helios is already running (PID ${existing.pid}). Run \`helios restart\` to replace it.`);
  await mkdir(locations.home, { recursive: true, mode: 0o700 });
  const record = { version: 1, pid, cliPath: path.resolve(cliPath), startedAt: new Date().toISOString() };
  const temporary = `${locations.runtime}.${pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, locations.runtime); await chmod(locations.runtime, 0o600);
  return { record, release: async () => { const current = await readRuntime(env).catch(() => null); if (current?.pid === pid) await rm(locations.runtime, { force: true }); } };
}

export async function verifyRuntimeOwner(record, execImpl = execFileAsync) {
  if (!record || !processExists(record.pid)) return false;
  if (process.platform === "win32") return false;
  try {
    const { stdout } = await execImpl("/bin/ps", ["-p", String(record.pid), "-o", "command="]);
    const command = stdout.trim();
    return Boolean(command && (command.includes(record.cliPath) || (command.includes("helios") && command.includes("node"))));
  } catch { return false; }
}

export function parseHeliosProcesses(output, cliPath, ownPid = process.pid) {
  const resolved = path.resolve(cliPath); const versionRoot = path.dirname(path.dirname(resolved));
  const installRoot = /^\d+\.\d+\.\d+-/.test(path.basename(versionRoot)) ? path.dirname(versionRoot) : null;
  return String(output).split("\n").map((line) => line.trim().match(/^(\d+)\s+(.+)$/)).filter(Boolean).map((match) => ({ pid: Number(match[1]), command: match[2] }))
    .filter((item) => item.pid !== ownPid && item.command.includes("src/cli.mjs") && (installRoot ? item.command.includes(`${installRoot}${path.sep}`) : item.command.includes(resolved)));
}

async function discoverLegacyRuntime(cliPath, execImpl = execFileAsync) {
  if (process.platform === "win32") return null;
  try {
    const { stdout } = await execImpl("/bin/ps", ["-axo", "pid=,command="]); const matches = parseHeliosProcesses(stdout, cliPath);
    if (matches.length > 1) throw new Error(`Found multiple Helios processes (${matches.map((item) => item.pid).join(", ")}); stop them manually before restarting.`);
    return matches[0] ? { version: 0, pid: matches[0].pid, cliPath: matches[0].command } : null;
  } catch (error) { if (/multiple Helios/.test(error.message)) throw error; return null; }
}

async function waitForExit(pid, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processExists(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !processExists(pid);
}

export async function stopHelios({ cliPath, env = process.env, readRuntimeImpl = readRuntime, discoverImpl = discoverLegacyRuntime, existsImpl = processExists, verifyImpl = verifyRuntimeOwner, killImpl = process.kill.bind(process), waitImpl = waitForExit, rmImpl = rm } = {}) {
  const record = await readRuntimeImpl(env) || await discoverImpl(cliPath);
  if (!record || !existsImpl(record.pid)) { await rmImpl(paths(env).runtime, { force: true }); return { stopped: false }; }
  if (record.version !== 0 && !(await verifyImpl(record))) throw new Error(`Refusing to stop PID ${record.pid}: it could not be verified as Helios.`);
  killImpl(record.pid, "SIGTERM");
  if (!(await waitImpl(record.pid))) throw new Error(`Helios PID ${record.pid} did not stop within 5 seconds. Stop it manually and retry.`);
  await rmImpl(paths(env).runtime, { force: true });
  return { stopped: true, pid: record.pid };
}

export async function startHelios({ cliPath, env = process.env, spawnImpl = spawn } = {}) {
  if (process.platform === "win32") throw new Error("Background process control is not available on Windows yet. Run `helios` in a terminal.");
  const current = await readRuntime(env);
  if (current && await verifyRuntimeOwner(current)) return { started: false, pid: current.pid };
  await rm(paths(env).runtime, { force: true });
  await mkdir(paths(env).logs, { recursive: true, mode: 0o700 });
  const log = await open(path.join(paths(env).logs, "service.log"), "a", 0o600);
  let child;
  try {
    child = spawnImpl(process.execPath, [path.resolve(cliPath), "service"], { env, detached: true, stdio: ["ignore", log.fd, log.fd] });
    child.unref();
  } finally { await log.close(); }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const record = await readRuntime(env).catch(() => null);
    if (record?.pid === child.pid) return { started: true, pid: child.pid };
    if (!processExists(child.pid)) throw new Error(`Helios service exited during startup. Check ${path.join(paths(env).logs, "service.log")}.`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Helios did not become ready within 5 seconds. Check ${path.join(paths(env).logs, "service.log")}.`);
}

export async function restartHelios(options = {}) {
  await stopHelios(options);
  return startHelios(options);
}
