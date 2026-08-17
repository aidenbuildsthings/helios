import assert from "node:assert/strict";
import test from "node:test";
import { preparePermissions } from "../src/permissions.mjs";

function ui() {
  const events = [];
  return { events, line: (value = "") => events.push(value), permissionStatus: (...values) => events.push(values), question: async () => "" };
}

test("disabled computer control requests no operating-system access", async () => {
  const terminal = ui(); let probes = 0;
  const result = await preparePermissions({ ui: terminal, config: { computer: { enabled: false }, browser: { enabled: false } }, probeAccessibility: async () => { probes += 1; }, probeScreen: async () => { probes += 1; } });
  assert.deepEqual(result, { computer: false, browser: false }); assert.equal(probes, 0);
});

test("setup opens macOS settings and verifies selected computer permissions", async () => {
  const terminal = ui(); const opened = []; let accessibility = 0; let screen = 0;
  const result = await preparePermissions({
    ui: terminal, config: { computer: { enabled: true }, browser: { enabled: false } }, platform: "darwin",
    probeAccessibility: async () => ++accessibility > 1,
    probeScreen: async () => ++screen > 1,
    openSettings: async (name) => opened.push(name),
  });
  assert.deepEqual(result, { computer: true, browser: false });
  assert.deepEqual(opened, ["Accessibility", "Screen Recording"]);
  assert.ok(terminal.events.some((event) => Array.isArray(event) && event[1] === "granted"));
});

test("setup remains incomplete when a selected permission cannot be verified", async () => {
  const terminal = ui();
  await assert.rejects(() => preparePermissions({ ui: terminal, config: { computer: { enabled: true }, browser: { enabled: false } }, platform: "linux", probeAccessibility: async () => false, probeScreen: async () => true }), /run `helios onboard` again/);
});

test("selected browser control must finish pairing during setup", async () => {
  const terminal = ui(); let configured = 0;
  const result = await preparePermissions({ ui: terminal, config: { computer: { enabled: false }, browser: { enabled: true } }, configureBrowser: async () => { configured += 1; } });
  assert.deepEqual(result, { computer: false, browser: true }); assert.equal(configured, 1);
});
