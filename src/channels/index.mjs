import { DiscordChannel } from "./discord.mjs";
import { SlackChannel } from "./slack.mjs";
import { TelegramChannel } from "./telegram.mjs";

export const CHANNELS = Object.freeze({
  telegram: { label: "Telegram", fields: [{ key: "token", label: "Bot token" }] },
  discord: { label: "Discord", fields: [{ key: "token", label: "Bot token" }] },
  slack: { label: "Slack", fields: [{ key: "botToken", label: "Bot token (xoxb-)" }, { key: "appToken", label: "Socket token (xapp-)" }] },
});

export function createChannel(id, config, onMessage) {
  if (id === "telegram") return new TelegramChannel({ ...config, onMessage });
  if (id === "discord") return new DiscordChannel({ ...config, onMessage });
  if (id === "slack") return new SlackChannel({ ...config, onMessage });
  throw new Error(`Unsupported channel: ${id}`);
}
