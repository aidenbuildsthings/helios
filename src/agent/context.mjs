export const DEFAULT_CONTEXT_TOKENS = 16_000;
const CHARS_PER_TOKEN = 4;
const MAX_SUMMARY_CHARS = 8_000;

export function compactContext(messages, maxTokens = DEFAULT_CONTEXT_TOKENS) {
  const limit = maxTokens * CHARS_PER_TOKEN;
  const total = messages.reduce((sum, message) => sum + messageSize(message), 0);
  if (total <= limit) return messages;

  const summaryBudget = Math.min(MAX_SUMMARY_CHARS, Math.floor(limit / 4));
  const recent = [];
  let recentSize = 0;
  let split = messages.length;
  while (split > 0) {
    const message = messages[split - 1];
    const size = messageSize(message);
    if (recent.length && recentSize + size > limit - summaryBudget) break;
    recent.unshift(message); recentSize += size; split -= 1;
  }

  // Tool results must never be detached from the assistant call that created them.
  while (recent.length && recent[0]?.role !== "user") {
    split += 1; recent.shift();
  }
  const omitted = messages.slice(0, split);
  const summary = summarize(omitted, Math.min(summaryBudget, limit - recentSize));
  return summary ? [{ role: "user", content: summary }, ...recent] : recent;
}

function summarize(messages, limit) {
  if (!messages.length || limit < 200) return "";
  const lines = ["Earlier conversation was compacted. Preserve these facts and decisions:"];
  for (const message of messages) {
    if (message.role === "tool") continue;
    const label = message.role === "user" ? "User" : "Helios";
    const content = String(message.content || "").replace(/\s+/g, " ").trim();
    if (!content) continue;
    lines.push(`${label}: ${content.slice(0, 600)}`);
  }
  const text = lines.join("\n");
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
}

function messageSize(message) {
  return JSON.stringify(message).length + 16;
}
