import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { BrowserBridge } from "./browser/bridge.mjs";
import { browserStatus } from "./browser/tools.mjs";
import { readSecret } from "./secrets.mjs";

const execFileAsync = promisify(execFile);

export async function preparePermissions({ ui, config, env = process.env, platform = process.platform, probeAccessibility = accessibilityProbe, probeScreen = screenProbe, openSettings = openPermissionSettings, configureBrowser = browserSetup }) {
  let computer = false; let browser = false;
  if (!config.computer.enabled) {
    ui.permissionStatus("Computer control", "not requested", "dim");
  } else {
    ui.line("\nHelios will now verify the access needed for computer control.");
    ui.line("It inspects the accessibility tree and captures one disposable test frame. Nothing is saved.\n");
    await requirePermission({ ui, name: "Accessibility", platform, probe: probeAccessibility, openSettings });
    await requirePermission({ ui, name: "Screen Recording", platform, probe: probeScreen, openSettings });
    computer = true;
  }
  if (!config.browser.enabled) ui.permissionStatus("Browser control", "not requested", "dim");
  else { await configureBrowser({ ui, config, env, platform }); browser = true; }
  return { computer, browser };
}

async function requirePermission({ ui, name, platform, probe, openSettings }) {
  if (await safeProbe(probe)) { ui.permissionStatus(name, "granted", "green"); return; }
  ui.permissionStatus(name, "action needed", "amber");
  if (platform === "darwin") {
    ui.line(`  macOS requires you to grant ${name} yourself. System Settings will open now.`);
    await openSettings(name, platform);
  } else {
    ui.line(`  Enable ${name} for this graphical Linux session, then return here.`);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await ui.question("  Press Enter after granting access to verify again: ");
    if (await safeProbe(probe)) { ui.permissionStatus(name, "granted", "green"); return; }
    ui.permissionStatus(name, "still unavailable", "red");
  }
  throw new Error(`${name} is still unavailable. Your answers were saved; grant access and run \`helios onboard\` again.`);
}

async function safeProbe(probe) { try { return await probe(); } catch { return false; } }

async function accessibilityProbe() {
  const xa11y = await import("@crowecawcaw/xa11y");
  await xa11y.App.list(); return true;
}

async function screenProbe() {
  const xa11y = await import("@crowecawcaw/xa11y");
  await xa11y.screenshot(); return true;
}

async function openPermissionSettings(name, platform) {
  if (platform !== "darwin") return;
  const pane = name === "Accessibility" ? "Privacy_Accessibility" : "Privacy_ScreenCapture";
  await execFileAsync("/usr/bin/open", [`x-apple.systempreferences:com.apple.preference.security?${pane}`]);
}

async function browserSetup({ ui, config, env, platform }) {
  const token = await readSecret("HELIOS_BROWSER_TOKEN", env);
  if (!token) throw new Error("Browser pairing token is unavailable. Disable browser control or run onboarding again.");
  const extension = fileURLToPath(new URL("../browser-extension", import.meta.url));
  const current = await browserStatus(config.browser.port, token);
  const bridge = current.online ? null : await new BrowserBridge({ port: config.browser.port, appToken: token }).start();
  try {
    if ((await browserStatus(config.browser.port, token)).connected) { ui.permissionStatus("Browser control", "connected", "green"); return; }
    ui.permissionStatus("Browser control", "action needed", "amber");
    ui.line(`  In Chrome: enable Developer mode, choose “Load unpacked”, and select:\n  ${extension}`);
    if (platform === "darwin") await execFileAsync("/usr/bin/open", ["-a", "Google Chrome", "chrome://extensions"]);
    else await execFileAsync("xdg-open", ["chrome://extensions"]);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await ui.question("  Click the Helios extension on a tab, then press Enter to verify: ");
      if ((await browserStatus(config.browser.port, token)).connected) { ui.permissionStatus("Browser control", "connected", "green"); return; }
      ui.permissionStatus("Browser control", "no tab connected", "red");
    }
    throw new Error("Browser control is not connected. Your answers were saved; connect the extension and run `helios onboard` again.");
  } finally { bridge?.stop(); }
}
