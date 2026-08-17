import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";

const base64url = (value) => Buffer.from(value).toString("base64url");

function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const args = [url];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

async function tokenRequest(values) {
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "OpenAI OAuth failed.");
  return { access: data.access_token, refresh: data.refresh_token, expiresAt: Date.now() + Number(data.expires_in) * 1000 };
}

export async function loginOpenAI(onUrl) {
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const state = crypto.randomBytes(20).toString("hex");
  const authorize = new URL("https://auth.openai.com/oauth/authorize");
  Object.entries({ response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: "openid profile email offline_access", code_challenge: challenge, code_challenge_method: "S256", state, id_token_add_organizations: "true", codex_cli_simplified_flow: "true", originator: "helios" })
    .forEach(([key, value]) => authorize.searchParams.set(key, value));
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { server.close(); reject(new Error("OpenAI login timed out.")); }, 10 * 60_000);
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, REDIRECT_URI);
      if (url.pathname !== "/auth/callback") { response.statusCode = 404; response.end(); return; }
      if (url.searchParams.get("state") !== state) { response.statusCode = 400; response.end("Invalid login state."); return; }
      const authorizationCode = url.searchParams.get("code");
      if (!authorizationCode) { response.statusCode = 400; response.end("Missing authorization code."); return; }
      response.end("Helios is connected. You can close this tab.");
      clearTimeout(timeout); server.close(); resolve(authorizationCode);
    });
    server.once("error", reject);
    server.listen(1455, "localhost", () => { onUrl?.(authorize.toString()); openBrowser(authorize.toString()); });
  });
  return tokenRequest({ grant_type: "authorization_code", client_id: CLIENT_ID, code, code_verifier: verifier, redirect_uri: REDIRECT_URI });
}

export async function refreshOpenAI(refreshToken) {
  return tokenRequest({ grant_type: "refresh_token", client_id: CLIENT_ID, refresh_token: refreshToken });
}

export function accountIdFromToken(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))["https://api.openai.com/auth"]?.chatgpt_account_id || null; }
  catch { return null; }
}
