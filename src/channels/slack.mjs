import { checkedJson, chunkMessage } from "./common.mjs";

export class SlackChannel {
  constructor({ botToken, appToken, onMessage, fetchImpl = fetch, WebSocketImpl = WebSocket }) {
    Object.assign(this, { botToken, appToken, onMessage, fetch: fetchImpl, WebSocketImpl });
  }
  async send(target, text) {
    for (const chunk of chunkMessage(text, 3900)) {
      await checkedJson(await this.fetch("https://slack.com/api/chat.postMessage", {
        method: "POST", headers: { authorization: `Bearer ${this.botToken}`, "content-type": "application/json" }, body: JSON.stringify({ channel: target, text: chunk }),
      }));
    }
  }
  async run() {
    const connection = await checkedJson(await this.fetch("https://slack.com/api/apps.connections.open", { method: "POST", headers: { authorization: `Bearer ${this.appToken}` } }));
    await new Promise((resolve, reject) => {
      const socket = new this.WebSocketImpl(connection.url);
      this.socket = socket;
      socket.addEventListener("message", async (message) => {
        const envelope = JSON.parse(String(message.data));
        if (envelope.envelope_id) socket.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
        const event = envelope.payload?.event;
        if (event?.type !== "message" || !event.text || event.bot_id || event.subtype) return;
        try { await this.onMessage({ channel: "slack", conversation: event.channel, sender: event.user, text: event.text, reply: (text) => this.send(event.channel, text) }); }
        catch (error) { await this.send(event.channel, `Helios error: ${error.message}`); }
      });
      socket.addEventListener("error", reject);
      socket.addEventListener("close", resolve);
    });
  }
  stop() { this.socket?.close(); }
}
