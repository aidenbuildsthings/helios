# Helios Agent

Install Helios with one command:

```sh
curl -fsSL https://raw.githubusercontent.com/aidenbuildsthings/helios/main/install.sh | bash
```

Then run `helios onboard`.

Helios is a standalone, local-first business agent with a provider-neutral agent loop,
durable sessions and memory, explicit approvals, subagent delegation, messaging adapters,
optional Obsidian notes, self-improving playbooks, and opt-in browser control.

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

Run `helios onboard` to choose ChatGPT/Codex sign-in, an Anthropic or OpenAI API key,
local or Obsidian memory, Telegram/Slack/Discord, autonomy, and self-improvement.

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

Autonomous mode is the default. Ordinary workspace writes, program execution, and computer
actions proceed without repeated prompts. Broad destructive commands, system-service
changes, package publishing, and capability creation still require explicit confirmation.

```sh
helios autonomy on
helios autonomy off
helios autonomy status
```
