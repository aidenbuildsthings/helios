import { AnthropicProvider } from "./anthropic.mjs";
import { OpenAIProvider } from "./openai.mjs";
import { OpenAICodexProvider } from "./openai-codex.mjs";
import { OllamaProvider } from "./ollama.mjs";

export const PROVIDERS = Object.freeze({
  "openai-codex": { label: "Sign in with ChatGPT", defaultModel: "gpt-5.6-sol" },
  openai: { label: "OpenAI API key", credential: "OPENAI_API_KEY", defaultModel: "gpt-5.2" },
  anthropic: { label: "Anthropic API key", credential: "ANTHROPIC_API_KEY", defaultModel: "claude-sonnet-4-6" },
  "ollama-local": { label: "Ollama Local", defaultModel: "qwen3:8b", host: "http://127.0.0.1:11434" },
  "ollama-cloud": { label: "Ollama Cloud", credential: "OLLAMA_API_KEY", defaultModel: "gpt-oss:120b", host: "https://ollama.com" },
});

export function createProvider({ id, apiKey, auth, model, saveAuth, fetchImpl }) {
  if (id === "openai-codex") return new OpenAICodexProvider({ auth, model, saveAuth, fetchImpl });
  if (id === "openai") return new OpenAIProvider({ apiKey, model, fetchImpl });
  if (id === "anthropic") return new AnthropicProvider({ apiKey, model, fetchImpl });
  if (id === "ollama-local" || id === "ollama-cloud") return new OllamaProvider({ apiKey, model, host: PROVIDERS[id].host, fetchImpl });
  throw new Error(`Unsupported provider: ${id}`);
}
