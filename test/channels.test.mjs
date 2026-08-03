import assert from "node:assert/strict";
import test from "node:test";
import { chunkMessage } from "../src/channels/common.mjs";
import { TelegramChannel } from "../src/channels/telegram.mjs";

test("channel messages are chunked without dropping text", () => {
  const input = "one two three four five six";
  const chunks = chunkMessage(input, 10);
  assert.equal(chunks.join(" "), input);
  assert.ok(chunks.every((chunk) => chunk.length <= 10));
});

test("Telegram outbound messages use the configured bot and target", async () => {
  let request;
  const channel = new TelegramChannel({
    token: "secret", onMessage() {},
    fetchImpl: async (url, init) => { request = { url, init }; return new Response(JSON.stringify({ ok: true, result: {} })); },
  });
  await channel.send("123", "hello");
  assert.match(request.url, /botsecret\/sendMessage/);
  assert.deepEqual(JSON.parse(request.init.body), { chat_id: "123", text: "hello" });
});
