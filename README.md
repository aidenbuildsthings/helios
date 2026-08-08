# Helios Agent

Install Helios on macOS or Linux:

```sh
curl -fsSL https://helios.scriptspace.xyz/install.sh | bash
```

Install Helios on Windows from PowerShell:

```powershell
powershell -c "irm https://helios.scriptspace.xyz/install.ps1 | iex"
```

Then run `helios onboard`.

Installation creates three locations:

- `~/.local/share/helios/` and `~/.local/bin/helios` on macOS/Linux
- `%LOCALAPPDATA%\Helios` and its `bin\helios.cmd` shim on Windows
- `~/.helios/` — private configuration, memory, sessions, skills, and logs

The installer creates `~/.helios/` with owner-only permissions and never overwrites its contents during updates.

Keep the installation healthy with:

```sh
helios update   # install the latest checksum-verified release
helios doctor   # diagnose configuration and runtime problems
helios restart  # restart the background Helios service
```

Agent and Desktop updates are independent. `helios update` changes only the command-line agent.
On macOS, `helios desktop` checks for a newer verified app release, updates it when needed, and
opens it. Desktop DMGs are distributed as implementation assets for that command; direct manual
installation is not a supported update path.

Run persistent channels, scheduled jobs, update checks, and browser control in the background:

```sh
helios start
helios ping
helios stop
helios restart
```

If a VPS supervisor such as systemd owns Helios, control that service through the supervisor instead.

See [CHANGELOG.md](CHANGELOG.md) for every update and [SECURITY.md](SECURITY.md) for the threat model and hardened VPS guidance.

Helios is a standalone, local-first business agent with a provider-neutral agent loop,
durable sessions and memory, explicit approvals, subagent delegation, messaging adapters,
optional Obsidian notes, self-improving playbooks, and opt-in browser control.

Downloaded skills accept verified ClawHub skill cards or direct GitHub `SKILL.md` files.
Helios stores only bounded instruction text and never installs bundled scripts or package hooks.

## Optional macOS Desktop

Helios Desktop is a separate native macOS app. The normal Helios installer does not install it.
Desktop uses the existing local configuration, Keychain credentials, SQLite sessions, memory,
skills, channels, tools, and learned capabilities through a private subprocess bridge. It opens
no network port and does not copy provider credentials into the app.

The Desktop app can verify and switch models, securely connect or disconnect messaging channels,
manage cron jobs, run a job immediately, inspect its output history, and notify you of failures.
Its private bridge reconnects automatically if the local subprocess exits.

Install, update, or open the latest checksum-verified Desktop release on macOS:

~~~sh
helios desktop
~~~

Build an unsigned local app bundle:

~~~sh
./desktop/build.sh --app-only
open desktop/dist/Helios.app
~~~

Build the DMG from a normal macOS session:

~~~sh
./desktop/build.sh
~~~

Public distribution requires an Apple Developer ID signature and notarization. Local builds use
an ad-hoc signature.

## Architecture

```text
Terminal ───────┐
Slack ──────────┤
Discord ────────┼── Agent core ── tools / approvals
Telegram ───────┤       │
Browser bridge ─┘       └── SQLite sessions + local or Obsidian memory
```

Connected channels run with an interactive `helios` session or `helios start`; no separate
gateway command is required. The terminal and channels use the same agent core. Remote messages cannot approve
local writes or command execution. Browser tools are exposed only while the local bridge
is reachable.

## Management commands

```sh
helios models                 # choose and verify a provider/model
helios channels list
helios channels add telegram
helios channels edit telegram
helios channels remove telegram
helios skills list
helios skills add <ClawHub-skill-or-GitHub-SKILL.md>
helios skills remove <id>
helios tools list
helios tools enable browser
helios tools disable computer
helios subagent                    # create a persistent specialist
helios subagent list
helios subagent remove <id>
helios cron                         # manage recurring work (also available in Desktop)
helios version
helios help
```

`helios uninstall` removes the installed program but preserves `~/.helios`. Use
`helios uninstall --purge` only when configuration, sessions, memory, skills, logs, and
Keychain credentials should also be permanently removed.

## Browser control

Browser control is opt-in. Enable it during onboarding or with `helios tools enable browser`,
load the bundled `browser-extension` directory as an unpacked Chrome extension, and click its
toolbar icon on the tab Helios may use. The authenticated bridge binds only to `127.0.0.1` and
starts automatically with an interactive or background Helios process.

Helios intentionally uses the extension rather than bundling Playwright. Playwright requires
version-matched browser downloads that consume hundreds of megabytes and must be refreshed with
library updates; the extension is smaller and works with the browser session the user explicitly selects.

## Setup

Run `helios onboard` and use the arrow keys to choose ChatGPT/Codex sign-in, an
Anthropic or OpenAI API key, Ollama Local, Ollama Cloud, local or Obsidian memory,
Telegram/Slack/Discord, autonomy, scheduled jobs, subagents, skills, and self-improvement.

With Obsidian selected, Helios creates `Memory.md`, `Instructions.md`, and dated Markdown
logs inside the chosen vault folder. These remain ordinary user-owned notes. Conversation
logs can contain sensitive prompt content, so choose a private vault.

## Learned Capabilities

Helios can recognize a stable repeatable workflow and propose a Learned Capability. Every
proposal includes a trigger, operating instructions, and verification criteria and requires
approval before it is saved. Helios can later propose evidence-backed improvements; revisions
retain the previous playbook. Capabilities are loaded in future sessions and their use count
is tracked.

```sh
helios capabilities
helios capabilities show <id>
helios capabilities remove <id>
```

Capabilities are declarative playbooks, not arbitrary generated programs. Helios cannot
silently modify its core or expand its permissions.

## Computer Use

Structured desktop control is included through xa11y. Helios can inspect application
accessibility trees, press controls, fill text fields, and send shortcuts. Check operating
system permissions with:

```sh
helios computer status
```

macOS requires Accessibility and Screen Recording access for the terminal running Helios. The bundled xa11y runtime also ships native Windows and Linux builds.

On Linux desktops, install `libsecret-tools` to let onboarding store credentials in the system Secret Service. Headless Linux/VPS deployments can provide the same secret names through the service environment. Windows secrets are encrypted for the current user with DPAPI; macOS continues to use Keychain.

## Autonomy

Guarded mode is the default. Autonomous mode lets ordinary workspace writes, program execution,
and computer actions proceed without repeated prompts. Broad destructive commands, system-service
changes, package publishing, and capability creation still require explicit confirmation.

```sh
helios autonomy on
helios autonomy off
helios autonomy status
```
