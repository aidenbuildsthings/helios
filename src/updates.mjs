import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const RELEASES_API = "https://api.github.com/repos/aidenbuildsthings/helios/releases?per_page=30";

export async function currentVersion() {
  return JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
}

export function compareVersions(left, right) {
  const a = left.replace(/^v/, "").split(".").map(Number); const b = right.replace(/^v/, "").split(".").map(Number);
  for (let index = 0; index < 3; index += 1) if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  return 0;
}

export async function checkForUpdate(fetchImpl = fetch) {
  const installed = await currentVersion();
  const response = await fetchImpl(RELEASES_API, { headers: { accept: "application/vnd.github+json", "user-agent": `helios/${installed}` }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Update check failed: ${response.status}.`);
  const releases = await response.json();
  const release = Array.isArray(releases) ? releases.find((item) => /^v\d+\.\d+\.\d+$/.test(item.tag_name) && !item.draft && !item.prerelease) : null;
  if (!release) throw new Error("GitHub did not return a stable Helios agent release.");
  const latest = release.tag_name.slice(1);
  return { installed, latest, available: compareVersions(latest, installed) > 0, url: release.html_url };
}

async function boundedText(response, maxBytes = 1_000_000) {
  if (!response.ok) throw new Error(`Download failed: ${response.status}.`);
  const declared = Number(response.headers.get("content-length") || 0); if (declared > maxBytes) throw new Error("Update file exceeds its safety limit.");
  const text = await response.text(); if (Buffer.byteLength(text) > maxBytes) throw new Error("Update file exceeds its safety limit."); return text;
}

export async function installLatestUpdate({ fetchImpl = fetch, spawnImpl = spawn, env = process.env, platform = process.platform } = {}) {
  const status = await checkForUpdate(fetchImpl);
  if (!status.available) return { ...status, updated: false };
  const root = `https://github.com/aidenbuildsthings/helios/releases/download/v${status.latest}`;
  const request = (url) => fetchImpl(url, { headers: { "user-agent": `helios/${status.installed}` }, signal: AbortSignal.timeout(20_000) });
  const installerName = platform === "win32" ? "install.ps1" : "install.sh";
  const [installer, sums] = await Promise.all([boundedText(await request(`${root}/${installerName}`)), boundedText(await request(`${root}/SHA256SUMS`))]);
  const expected = sums.split("\n").map((line) => line.trim().split(/\s+/)).find(([, name]) => name === installerName)?.[0];
  if (!/^[a-f0-9]{64}$/i.test(expected || "")) throw new Error(`Release checksum manifest does not contain ${installerName}.`);
  const actual = crypto.createHash("sha256").update(installer).digest("hex");
  if (actual !== expected.toLowerCase()) throw new Error("Downloaded installer failed SHA-256 verification.");
  const directory = await mkdtemp(path.join(os.tmpdir(), "helios-update-")); const file = path.join(directory, installerName);
  try {
    await writeFile(file, installer, { mode: 0o700 }); if (platform !== "win32") await chmod(file, 0o700);
    const code = await new Promise((resolve, reject) => {
      const command = platform === "win32" ? "powershell.exe" : "/bin/bash";
      const args = platform === "win32" ? ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file] : [file];
      const child = spawnImpl(command, args, { env: { ...env, HELIOS_VERSION: status.latest }, stdio: "inherit" });
      child.once("error", reject); child.once("exit", (value, signal) => signal ? reject(new Error(`Installer stopped by ${signal}.`)) : resolve(value ?? 1));
    });
    if (code !== 0) throw new Error(`Installer failed with exit code ${code}.`);
    return { ...status, updated: true };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export function startUpdateChecks({ config, ui, fetchImpl = fetch }) {
  if (!config.updates?.enabled) return null;
  const check = async () => {
    try { const result = await checkForUpdate(fetchImpl); if (result.available) ui.line(`\nHelios ${result.latest} is available: ${result.url}`); }
    catch (error) { ui.line(`\nUpdate check failed: ${error.message}`); }
  };
  void check();
  const timer = setInterval(check, Math.max(1, Number(config.updates.intervalHours || 6)) * 3_600_000);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
