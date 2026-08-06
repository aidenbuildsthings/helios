# Helios Agent

Install Helios with one command:

```sh
curl -fsSL https://github.com/aidenbuildsthings/helios/releases/latest/download/install.sh | bash
```

Then run `helios onboard`.

Keep the installation healthy with:

```sh
helios update   # install the latest checksum-verified release
helios doctor   # diagnose configuration and runtime problems
helios restart  # stop the foreground Helios process and run it again
```

`helios restart` manages Helios's foreground process. If a VPS supervisor such as systemd
owns Helios, restart that service through the supervisor instead.

See [CHANGELOG.md](CHANGELOG.md) for every update and [SECURITY.md](SECURITY.md) for the threat model and hardened VPS guidance.

Helios is a standalone, local-first business agent with a provider-neutral agent loop,
durable sessions and memory, explicit approvals, subagent delegation, messaging adapters,
optional Obsidian notes, self-improving playbooks, and opt-in browser control.

Downloaded skills accept verified ClawHub skill cards or direct GitHub `SKILL.md` files.
Helios stores only bounded instruction text and never installs bundled scripts or package hooks.

## Architecture

```text
Terminal ───────┐
Slack ──────────┤
Discord ────────┼── Agent core ── tools / approvals
Telegram ───────┤       │
Browser bridge ─┘       └── SQLite sessions + local or Obsidian memory
```

Connected channels start with `helios`; no separate gateway command is required. The
terminal and channels use the same agent core. Remote messages cannot approve
local writes or command execution. Browser tools are exposed only while the local bridge
is reachable.

## Setup

Run `helios onboard` and use the arrow keys to choose ChatGPT/Codex sign-in, an
Anthropic or OpenAI API key, Ollama Local, Ollama Cloud, local or Obsidian memory,
Telegram/Slack/Discord, autonomy, scheduled jobs, workers, skills, and self-improvement.

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

macOS requires Accessibility and Screen Recording access for the terminal running Helios.

## Autonomy

Guarded mode is the default. Autonomous mode lets ordinary workspace writes, program execution,
and computer actions proceed without repeated prompts. Broad destructive commands, system-service
changes, package publishing, and capability creation still require explicit confirmation.

```sh
helios autonomy on
helios autonomy off
helios autonomy status
```
