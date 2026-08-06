import { randomUUID } from "node:crypto";
import http from "node:http";

export class BrowserBridge {
  constructor({ port = 47821, appToken }) { if (!appToken) throw new Error("Browser bridge app token is required."); this.port = port; this.appToken = appToken; this.extensionToken = null; this.queue = []; this.pending = new Map(); }
  async action(action, input = {}) {
    const id = randomUUID();
    this.queue.push({ id, action, input });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Browser extension did not respond. Enable the browser tool and click the Helios extension icon on a tab.")); }, 20_000);
      this.pending.set(id, (result) => { clearTimeout(timer); result.error ? reject(new Error(result.error)) : resolve(result); });
    });
  }
  start() {
    this.server = http.createServer(async (request, response) => {
      const origin = request.headers.origin || "";
      if (origin.startsWith("chrome-extension://")) response.setHeader("access-control-allow-origin", origin);
      response.setHeader("access-control-allow-headers", "content-type,x-helios-token");
      response.setHeader("content-type", "application/json");
      if (request.method === "OPTIONS") { response.statusCode = 204; response.end(); return; }
      if (request.method === "POST" && request.url === "/pair" && origin.startsWith("chrome-extension://")) {
        let raw = ""; for await (const chunk of request) raw += chunk;
        const token = JSON.parse(raw || "{}").token; if (typeof token !== "string" || token.length < 32) { response.statusCode = 400; response.end(JSON.stringify({ error: "Invalid pairing token" })); return; }
        this.extensionToken = token; response.end(JSON.stringify({ ok: true })); return;
      }
      const token = request.headers["x-helios-token"];
      const appRequest = token === this.appToken; const extensionRequest = token === this.extensionToken && this.extensionToken;
      if (!appRequest && !extensionRequest) { response.statusCode = 401; response.end(JSON.stringify({ error: "Unauthorized" })); return; }
      if (request.method === "GET" && request.url === "/health") { response.end(JSON.stringify({ ok: true, connected: Boolean(this.extensionToken) })); return; }
      if (request.method === "GET" && request.url === "/next" && extensionRequest) { response.end(JSON.stringify(this.queue.shift() || null)); return; }
      let raw = ""; for await (const chunk of request) raw += chunk;
      if (request.method === "POST" && request.url === "/action" && appRequest) {
        const command = JSON.parse(raw || "{}");
        try { response.end(JSON.stringify(await this.action(command.action, command.input))); }
        catch (error) { response.statusCode = 504; response.end(JSON.stringify({ error: error.message })); }
        return;
      }
      if (request.method === "POST" && request.url === "/result" && extensionRequest) {
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
