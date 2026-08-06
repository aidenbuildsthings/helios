import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildInfo, manageTools, uninstallHelios } from "../src/management.mjs";
import { readConfig, writeConfig } from "../src/config.mjs";

test("version reads release build metadata", async () => {
  const base = path.join(os.tmpdir(), `helios-build-${crypto.randomUUID()}`); await mkdir(path.join(base, "src"), { recursive: true });
  await writeFile(path.join(base, "package.json"), JSON.stringify({ version: "1.0.0" }));
  await writeFile(path.join(base, "build.json"), JSON.stringify({ version: "1.2.3", commit: "abc123", installedAt: "2026-08-06T00:00:00Z" }));
  const info = await buildInfo(path.join(base, "src", "cli.mjs"));
  assert.deepEqual(info, { version: "1.2.3", commit: "abc123", installedAt: "2026-08-06T00:00:00Z" });
});

test("tools modify tool configuration without touching channels", async () => {
  const home = path.join(os.tmpdir(), `helios-tools-${crypto.randomUUID()}`); const env = { HELIOS_HOME: home };
  await writeConfig({ version: 2, channels: { telegram: { enabled: true } }, computer: { enabled: false }, browser: { enabled: false, port: 47821 } }, env);
  const lines = []; await manageTools({ line: (value) => lines.push(value) }, ["enable", "computer"], env);
  const config = await readConfig(env); assert.equal(config.computer.enabled, true); assert.equal(config.channels.telegram.enabled, true);
});

test("uninstall removes only a recognized installation and preserves data by default", async () => {
  const base = path.join(os.tmpdir(), `helios-uninstall-${crypto.randomUUID()}`); const installRoot = path.join(base, "share", "helios"); const binDir = path.join(base, "bin");
  const versionDir = path.join(installRoot, "1.2.3-20260806010101"); const cli = path.join(versionDir, "src", "cli.mjs"); const home = path.join(base, "state");
  await mkdir(path.dirname(cli), { recursive: true }); await mkdir(binDir, { recursive: true }); await mkdir(home, { recursive: true });
  await writeFile(cli, "#!/usr/bin/env node\n"); await writeFile(path.join(home, "keep"), "yes"); await symlink(cli, path.join(binDir, "helios"));
  const result = await uninstallHelios({ cliPath: cli, env: { HELIOS_INSTALL_DIR: installRoot, HELIOS_BIN_DIR: binDir, HELIOS_HOME: home } });
  assert.equal(result.dataRemoved, false); assert.equal(await readFile(path.join(home, "keep"), "utf8"), "yes");
  await assert.rejects(() => readFile(cli), /ENOENT/);
});
