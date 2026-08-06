import { createApp } from "./app.mjs";
import { createChannel } from "./channels/index.mjs";
import { readSecret } from "./secrets.mjs";

export async function runChannels({ config, ui }) {
  const service = await startChannels({ config, ui });
  if (!service) throw new Error("No channels are connected. Run `helios channels connect`.");
  await service.done;
}

export async function startChannels({ config, ui }) {
  const active = Object.entries(config.channels || {}).filter(([, value]) => value?.enabled);
  if (!active.length) return null;
  const onMessage = async (message) => {
    const channelConfig = config.channels?.[message.channel];
    if (!channelConfig?.allowedSenders?.includes(String(message.sender))) {
      ui.line(`Blocked unauthorized ${message.channel} sender ${message.sender}.`);
      return;
    }
    ui.line(`\n${message.channel} · ${message.sender}: ${message.text}`);
    const sessionId = `${message.channel}:${message.conversation}`;
    const remoteUI = {
      ...ui,
      approve: async () => false,
      status: () => {}, toolStart: () => {}, toolEnd: () => {},
    };
    const app = await createApp({ ui: remoteUI, sessionId, approvalMode: "guarded", surface: "remote" });
    try { await message.reply(await app.agent.send(message.text)); }
    finally { app.store.close(); }
  };
  const adapters = await Promise.all(active.map(async ([id, channelConfig]) => {
    const hydrated = { ...channelConfig };
    for (const key of id === "slack" ? ["botToken", "appToken"] : ["token"]) hydrated[key] = await readSecret(`HELIOS_${id}_${key}`.toUpperCase()) || channelConfig[key];
    if ((id === "slack" && (!hydrated.botToken || !hydrated.appToken)) || (id !== "slack" && !hydrated.token)) throw new Error(`${id} credentials are missing. Run \`helios onboard\`.`);
    return createChannel(id, hydrated, onMessage);
  }));
  const stop = () => adapters.forEach((adapter) => adapter.stop());
  ui.line(`Channels online: ${active.map(([id]) => id).join(", ")}`);
  const done = Promise.all(adapters.map((adapter) => adapter.run())).catch((error) => ui.error(`Channel stopped: ${error.message}`));
  return { stop, done, ids: active.map(([id]) => id) };
}
