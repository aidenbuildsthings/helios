import { checkedJson, chunkMessage } from "./common.mjs";

export class DiscordChannel {
  constructor({ token, onMessage, fetchImpl = fetch, WebSocketImpl = WebSocket }) {
    Object.assign(this, { token, onMessage, fetch: fetchImpl, WebSocketImpl });
    this.sequence = null;
    this.heartbeat = null;
  }
  async send(target, text) {
    for (const chunk of chunkMessage(text, 1900)) {
      await checkedJson(await this.fetch(`https://discord.com/api/v10/channels/${target}/messages`, {
        method: "POST", headers: { authorization: `Bot ${this.token}`, "content-type": "application/json" }, body: JSON.stringify({ content: chunk }),
      }));
    }
  }
  async run() {
    const gateway = await checkedJson(await this.fetch("https://discord.com/api/v10/gateway/bot", { headers: { authorization: `Bot ${this.token}` } }));
    await new Promise((resolve, reject) => {
      const socket = new this.WebSocketImpl(`${gateway.url}?v=10&encoding=json`);
      this.socket = socket;
      socket.addEventListener("message", async (event) => {
        const payload = JSON.parse(String(event.data));
        if (payload.s != null) this.sequence = payload.s;
        if (payload.op === 10) {
          this.heartbeat = setInterval(() => socket.send(JSON.stringify({ op: 1, d: this.sequence })), payload.d.heartbeat_interval);
          socket.send(JSON.stringify({ op: 2, d: { token: this.token, intents: 33281, properties: { os: process.platform, browser: "helios", device: "helios" } } }));
        }
        if (payload.t === "MESSAGE_CREATE" && payload.d?.content && !payload.d.author?.bot) {
          try { await this.onMessage({ channel: "discord", conversation: payload.d.channel_id, sender: payload.d.author.id, text: payload.d.content, reply: (text) => this.send(payload.d.channel_id, text) }); }
          catch (error) { await this.send(payload.d.channel_id, `Helios error: ${error.message}`); }
        }
      });
      socket.addEventListener("error", reject);
      socket.addEventListener("close", resolve);
    });
  }
  stop() { clearInterval(this.heartbeat); this.socket?.close(); }
}
