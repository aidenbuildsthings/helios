import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import crypto from "node:crypto";
import { compareVersions, installLatestUpdate } from "../src/updates.mjs";

test("update versions compare numerically", () => {
  assert.equal(compareVersions("0.2.0", "0.1.9") > 0, true);
  assert.equal(compareVersions("v1.0.0", "1.0.0"), 0);
});

test("update verifies the installer before running it", async () => {
  const installer = "#!/bin/bash\nexit 0\n"; const digest = crypto.createHash("sha256").update(installer).digest("hex"); const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    if (String(url).endsWith("/releases/latest")) return new Response(JSON.stringify({ tag_name: "v9.9.9", html_url: "https://example.test/release" }));
    if (String(url).endsWith("/install.sh")) return new Response(installer);
    return new Response(`${digest}  install.sh\n`);
  };
  let spawned = null;
  const spawnImpl = (command, args, options) => {
    spawned = { command, args, options }; const child = new EventEmitter(); queueMicrotask(() => child.emit("exit", 0, null)); return child;
  };
  const result = await installLatestUpdate({ fetchImpl, spawnImpl, env: { PATH: "/bin" }, platform: "linux" });
  assert.equal(result.updated, true); assert.equal(spawned.command, "/bin/bash"); assert.equal(spawned.options.env.HELIOS_VERSION, "9.9.9");
  assert.equal(requested.length, 3);
});

test("update refuses a checksum mismatch", async () => {
  const fetchImpl = async (url) => String(url).endsWith("/releases/latest")
    ? new Response(JSON.stringify({ tag_name: "v9.9.9", html_url: "https://example.test/release" }))
    : String(url).endsWith("/install.sh") ? new Response("installer") : new Response(`${"0".repeat(64)}  install.sh\n`);
  await assert.rejects(() => installLatestUpdate({ fetchImpl, platform: "linux" }), /SHA-256/);
});
