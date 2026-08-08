import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("installer creates a private persistent Helios state directory", async () => {
  const installer = await readFile(new URL("../install.sh", import.meta.url), "utf8");
  assert.match(installer, /STATE_DIR="\$\{HELIOS_HOME:-\$HOME\/\.helios\}"/);
  assert.match(installer, /mkdir -p "\$INSTALL_ROOT" "\$BIN_DIR" "\$STATE_DIR"/);
  assert.match(installer, /chmod 700 "\$STATE_DIR"/);
});

test("Windows installer verifies its archive and creates a command shim", async () => {
  const installer = await readFile(new URL("../install.ps1", import.meta.url), "utf8");
  assert.match(installer, /Get-FileHash -Algorithm SHA256/);
  assert.match(installer, /helios\.cmd/);
  assert.match(installer, /\.helios/);
  assert.match(installer, /SetEnvironmentVariable\("Path"/);
});
