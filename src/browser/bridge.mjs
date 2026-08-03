import { randomUUID } from "node:crypto";
import http from "node:http";

export class BrowserBridge {
  constructor({ port = 47821 }) { this.port = port; this.queue = []; this.pending = new Map(); }
  async action(action, input = {}) {
    const id = randomUUID();
    this.queue.push({ id, action, input });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Browser extension did not respond. Start `helios browser` and connect a tab.")); }, 20_000);
      this.pending.set(id, (result) => { clearTimeout(timer); result.error ? reject(new Error(result.error)) : resolve(result); });
    });
  }
  start() {
    this.server = http.createServer(async (request, response) => {
      response.setHeader("access-control-allow-origin", "*");
      response.setHeader("access-control-allow-headers", "content-type");
      response.setHeader("content-type", "application/json");
      if (request.method === "OPTIONS") { response.statusCode = 204; response.end(); return; }
      if (request.method === "GET" && request.url === "/health") { response.end(JSON.stringify({ ok: true })); return; }
      if (request.method === "GET" && request.url === "/next") { response.end(JSON.stringify(this.queue.shift() || null)); return; }
      let raw = ""; for await (const chunk of request) raw += chunk;
      if (request.method === "POST" && request.url === "/action") {
        const command = JSON.parse(raw || "{}");
        try { response.end(JSON.stringify(await this.action(command.action, command.input))); }
        catch (error) { response.statusCode = 504; response.end(JSON.stringify({ error: error.message })); }
        return;
      }
      if (request.method === "POST" && request.url === "/result") {
        const result = JSON.parse(raw || "{}"); this.pending.get(result.id)?.(result); this.pending.delete(result.id);
        response.end(JSON.stringify({ ok: true })); return;
      }
      response.statusCode = 404; response.end(JSON.stringify({ error: "Not found" }));
    });
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, "127.0.0.1", () => resolve(this));
    });
  }
  stop() { this.server?.close(); }
}
