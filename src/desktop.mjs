import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { compareVersions } from "./updates.mjs";

const RELEASES_API = "https://api.github.com/repos/aidenbuildsthings/helios/releases?per_page=30";
const runFile = promisify(execFile);

async function exists(file) { return access(file).then(() => true, () => false); }

export function verifyDesktopChecksum(name, bytes, checksumText) {
  const expected = checksumText.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).find((parts) => parts.at(-1) === name)?.[0];
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected)) throw new Error(`The release does not contain a valid checksum for ${name}.`);
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected.toLowerCase()) throw new Error("Helios Desktop download failed checksum verification.");
}

export function selectDesktopRelease(releases) {
  const release = Array.isArray(releases) ? releases.find((item) => /^desktop-v\d+\.\d+\.\d+$/.test(item.tag_name) && !item.draft && !item.prerelease) : null;
  if (!release) throw new Error("GitHub did not return a stable Helios Desktop release.");
  return { ...release, version: release.tag_name.slice("desktop-v".length) };
}

async function installedVersion(app) {
  const plist = await readFile(path.join(app, "Contents", "Info.plist"), "utf8").catch(() => "");
  return plist.match(/<key>CFBundleShortVersionString<\/key><string>([^<]+)<\/string>/)?.[1] || "0.0.0";
}

export async function openDesktop({ cliPath, env = process.env, platform = process.platform, fetchImpl = fetch, execImpl = runFile } = {}) {
  if (platform !== "darwin") throw new Error("Helios Desktop is currently available for macOS only.");
  const sourceApp = cliPath ? path.join(path.dirname(path.dirname(cliPath)), "desktop", "dist", "Helios.app") : null;
  const userApp = path.join(env.HOME || os.homedir(), "Applications", "Helios.app");
  if (sourceApp && await exists(sourceApp)) { await execImpl("/usr/bin/open", [sourceApp]); return { app: sourceApp, installed: false, updated: false, version: await installedVersion(sourceApp) }; }
  let app = await exists(userApp) ? userApp : await exists("/Applications/Helios.app") ? "/Applications/Helios.app" : null;
  const response = await fetchImpl(RELEASES_API, { headers: { accept: "application/vnd.github+json", "user-agent": "helios-agent" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    if (app) { await execImpl("/usr/bin/open", [app]); return { app, installed: false, updated: false, version: await installedVersion(app), updateCheckFailed: true }; }
    throw new Error(`Could not find the latest Helios Desktop release (HTTP ${response.status}).`);
  }
  const release = selectDesktopRelease(await response.json());
  const current = app ? await installedVersion(app) : "0.0.0";
  let installed = false; let updated = false;
  if (!app || compareVersions(release.version, current) > 0) {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const dmg = assets.find((asset) => /^Helios-Desktop-.*\.dmg$/.test(asset.name)); const sums = assets.find((asset) => asset.name === "SHA256SUMS");
    if (!dmg || !sums) throw new Error("The latest release does not include a verified macOS Desktop installer yet.");
    const [dmgResponse, sumsResponse] = await Promise.all([fetchImpl(dmg.browser_download_url), fetchImpl(sums.browser_download_url)]);
    if (!dmgResponse.ok || !sumsResponse.ok) throw new Error("Helios Desktop download failed.");
    const bytes = Buffer.from(await dmgResponse.arrayBuffer()); verifyDesktopChecksum(dmg.name, bytes, await sumsResponse.text());
    const temp = await mkdtemp(path.join(os.tmpdir(), "helios-desktop-install-")); const image = path.join(temp, dmg.name); const mount = path.join(temp, "mount");
    await writeFile(image, bytes, { mode: 0o600 }); await mkdir(mount, { mode: 0o700 });
    await execImpl("/usr/bin/hdiutil", ["attach", image, "-nobrowse", "-readonly", "-mountpoint", mount]);
    try {
      const bundled = path.join(mount, "Helios.app");
      if (!await exists(bundled)) throw new Error("The Desktop image does not contain Helios.app.");
      await mkdir(path.dirname(userApp), { recursive: true }); await execImpl("/usr/bin/ditto", [bundled, userApp]);
      await execImpl("/usr/bin/codesign", ["--verify", "--deep", "--strict", userApp]);
      updated = Boolean(app); app = userApp; installed = !updated;
    } finally { await execImpl("/usr/bin/hdiutil", ["detach", mount]).catch(() => {}); }
  }
  await execImpl("/usr/bin/open", [app]);
  return { app, installed, updated, version: release.version };
}
