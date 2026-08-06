import assert from "node:assert/strict";
import test from "node:test";
import { BrowserBridge } from "../src/browser/bridge.mjs";

test("browser bridge round-trips an extension action", async () => {
  const appToken = "a".repeat(64); const extensionToken = "b".repeat(64);
  const bridge = await new BrowserBridge({ port: 0, appToken }).start();
  const port = bridge.server.address().port;
  const unauthorized = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(unauthorized.status, 401);
  await fetch(`http://127.0.0.1:${port}/pair`, { method: "POST", headers: { "content-type": "application/json", origin: "chrome-extension://test" }, body: JSON.stringify({ token: extensionToken }) });
  const action = fetch(`http://127.0.0.1:${port}/action`, { method: "POST", headers: { "content-type": "application/json", "x-helios-token": appToken }, body: JSON.stringify({ action: "snapshot", input: {} }) });
  while (!bridge.queue.length) await new Promise((resolve) => setTimeout(resolve, 5));
  const task = await fetch(`http://127.0.0.1:${port}/next`, { headers: { "x-helios-token": extensionToken } }).then((response) => response.json());
  await fetch(`http://127.0.0.1:${port}/result`, { method: "POST", headers: { "content-type": "application/json", "x-helios-token": extensionToken }, body: JSON.stringify({ id: task.id, title: "Page" }) });
  assert.equal((await action.then((response) => response.json())).title, "Page");
  bridge.stop();
});
