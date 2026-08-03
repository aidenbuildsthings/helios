import assert from "node:assert/strict";
import test from "node:test";
import { BrowserBridge } from "../src/browser/bridge.mjs";

test("browser bridge round-trips an extension action", async () => {
  const bridge = await new BrowserBridge({ port: 0 }).start();
  const port = bridge.server.address().port;
  const action = fetch(`http://127.0.0.1:${port}/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "snapshot", input: {} }) });
  while (!bridge.queue.length) await new Promise((resolve) => setTimeout(resolve, 5));
  const task = await fetch(`http://127.0.0.1:${port}/next`).then((response) => response.json());
  await fetch(`http://127.0.0.1:${port}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: task.id, title: "Page" }) });
  assert.equal((await action.then((response) => response.json())).title, "Page");
  bridge.stop();
});
