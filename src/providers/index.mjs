import { AnthropicProvider } from "./anthropic.mjs";
import { OpenAIProvider } from "./openai.mjs";
import { OpenAICodexProvider } from "./openai-codex.mjs";

export const PROVIDERS = Object.freeze({
  "openai-codex": { label: "Sign in with ChatGPT", defaultModel: "gpt-5.6-sol" },
  openai: { label: "OpenAI API key", credential: "OPENAI_API_KEY", defaultModel: "gpt-5.2" },
  anthropic: { label: "Anthropic API key", credential: "ANTHROPIC_API_KEY", defaultModel: "claude-sonnet-4-6" },
});

export function createProvider({ id, apiKey, auth, model, saveAuth, fetchImpl }) {
  if (id === "openai-codex") return new OpenAICodexProvider({ auth, model, saveAuth, fetchImpl });
  if (id === "openai") return new OpenAIProvider({ apiKey, model, fetchImpl });
  if (id === "anthropic") return new AnthropicProvider({ apiKey, model, fetchImpl });
  throw new Error(`Unsupported provider: ${id}`);
}
