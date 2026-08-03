import { checkedJson, chunkMessage } from "./common.mjs";

export class TelegramChannel {
  constructor({ token, onMessage, fetchImpl = fetch }) {
    Object.assign(this, { token, onMessage, fetch: fetchImpl });
    this.offset = 0;
    this.stopped = false;
  }
  api(method) { return `https://api.telegram.org/bot${this.token}/${method}`; }
  async send(target, text) {
    for (const chunk of chunkMessage(text, 4000)) {
      await checkedJson(await this.fetch(this.api("sendMessage"), {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: target, text: chunk }),
      }));
    }
  }
  async run() {
    this.stopped = false;
    while (!this.stopped) {
      try {
        const data = await checkedJson(await this.fetch(`${this.api("getUpdates")}?timeout=25&offset=${this.offset}`));
        for (const update of data.result || []) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          const message = update.message;
          if (!message?.text || message.from?.is_bot) continue;
          await this.onMessage({ channel: "telegram", conversation: String(message.chat.id), sender: String(message.from.id), text: message.text, reply: (text) => this.send(message.chat.id, text) });
        }
      } catch (error) {
        if (this.stopped) break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  stop() { this.stopped = true; }
}
