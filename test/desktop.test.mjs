import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openDesktop, selectDesktopRelease, verifyDesktopChecksum } from "../src/desktop.mjs";

test("desktop release checksum is mandatory and exact", () => {
  const bytes = Buffer.from("verified desktop");
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  verifyDesktopChecksum("Helios-Desktop.dmg", bytes, `${digest}  Helios-Desktop.dmg\n`);
  assert.throws(() => verifyDesktopChecksum("Helios-Desktop.dmg", Buffer.from("changed"), `${digest}  Helios-Desktop.dmg\n`), /checksum verification/);
});

test("desktop command opens a source build without downloading", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "helios-desktop-open-"));
  const cliPath = path.join(root, "src", "cli.mjs"); const app = path.join(root, "desktop", "dist", "Helios.app");
  await mkdir(path.dirname(cliPath), { recursive: true }); await mkdir(app, { recursive: true });
  const calls = [];
  const result = await openDesktop({ cliPath, platform: "darwin", fetchImpl: () => { throw new Error("unexpected download"); }, execImpl: async (...args) => calls.push(args) });
  assert.deepEqual(result, { app, installed: false, updated: false, version: "0.0.0" });
  assert.deepEqual(calls, [["/usr/bin/open", [app]]]);
});

test("desktop update selection ignores agent releases", () => {
  const release = selectDesktopRelease([{ tag_name: "v99.0.0" }, { tag_name: "desktop-v1.2.3", draft: false, prerelease: false }]);
  assert.equal(release.version, "1.2.3");
});
