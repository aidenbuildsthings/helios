import { createApp } from "./app.mjs";
import { createChannel } from "./channels/index.mjs";

export async function runChannels({ config, ui }) {
  const service = await startChannels({ config, ui });
  if (!service) throw new Error("No channels are connected. Run `helios channels connect`.");
  await service.done;
}

export async function startChannels({ config, ui }) {
  const active = Object.entries(config.channels || {}).filter(([, value]) => value?.enabled);
  if (!active.length) return null;
  const onMessage = async (message) => {
    ui.line(`\n${message.channel} · ${message.sender}: ${message.text}`);
    const sessionId = `${message.channel}:${message.conversation}`;
    const remoteUI = {
      ...ui,
      approve: async () => false,
      status: () => {}, toolStart: () => {}, toolEnd: () => {},
    };
    const app = await createApp({ ui: remoteUI, sessionId, approvalMode: "guarded" });
    try { await message.reply(await app.agent.send(message.text)); }
    finally { app.store.close(); }
  };
  const adapters = active.map(([id, channelConfig]) => createChannel(id, channelConfig, onMessage));
  const stop = () => adapters.forEach((adapter) => adapter.stop());
  ui.line(`Channels online: ${active.map(([id]) => id).join(", ")}`);
  const done = Promise.all(adapters.map((adapter) => adapter.run())).catch((error) => ui.error(`Channel stopped: ${error.message}`));
  return { stop, done, ids: active.map(([id]) => id) };
}
