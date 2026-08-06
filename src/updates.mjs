import { readFile } from "node:fs/promises";

const RELEASE_API = "https://api.github.com/repos/aidenbuildsthings/helios/releases/latest";

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
  const response = await fetchImpl(RELEASE_API, { headers: { accept: "application/vnd.github+json", "user-agent": `helios/${installed}` }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Update check failed: ${response.status}.`);
  const release = await response.json(); const latest = String(release.tag_name || "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error("GitHub returned an invalid Helios release version.");
  return { installed, latest, available: compareVersions(latest, installed) > 0, url: release.html_url };
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
