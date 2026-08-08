# Changelog

## Unreleased

### Added

- Desktop Cron Jobs management with schedule presets, custom five-field expressions, optional
  subagent assignment, enable/disable controls, and removal through the existing local scheduler.

## [0.5.0] - 2026-08-08

### Added

- Optional native macOS Desktop app with live chat, approvals, sessions, channels, model status,
  tools, skills, learned capabilities, activity, settings, and local DMG packaging.
- Private desktop subprocess bridge that keeps Helios configuration and credentials in their
  existing local owners and exposes no listening network port.
- System-default light and dark themes, expanded settings, smoother interactions, a monochrome
  native app icon, and corrected macOS title-bar clearance.
- Persistent model-aware subagents, automatic purpose-based delegation, and a live Desktop
  kanban board backed by recorded subagent task state.
- `helios subagent` interactive profile creation and checksum-verified, on-demand installation
  through `helios desktop`.
- Universal Intel and Apple Silicon Desktop DMGs in tagged GitHub releases.
- A macOS-only onboarding hatch choice for Terminal, Desktop, or finishing without launching.

### Changed

- Agent and Desktop releases now have independent versions and update paths. `helios update`
  updates only the agent; `helios desktop` checks, updates, and opens only the app.

All notable Helios changes are recorded here and repeated in the corresponding GitHub release.

## [0.4.0] - 2026-08-08

### Added

- Windows installation through the checksum-verified `install.ps1` release asset and `helios.cmd` user-PATH shim.
- Windows automatic updates, background process ownership checks, and start/stop/restart support.
- Windows DPAPI-protected credential persistence and Linux Secret Service integration.
- Versioned ZIP release archives alongside the existing macOS/Linux tarballs.

### Changed

- The shell installer now explicitly supports macOS and Linux and reports Linux keyring or PATH prerequisites when needed.
- Browser tokens, provider keys, OAuth sessions, and channel credentials use the native secure backend on every desktop platform.

## [0.3.2] - 2026-08-06

### Fixed

- Arrow-key and multi-select onboarding menus now keep terminal input active instead of exiting after rendering the first screen.
- Hidden credential prompts use the same repaired terminal-input lifecycle and cancel cleanly.

## [0.3.1] - 2026-08-06

### Changed

- The one-line installer now creates the private `~/.helios/` state directory immediately with owner-only permissions, while preserving existing state during installs and updates.

## [0.3.0] - 2026-08-06

### Added

- `helios start`, `stop`, `restart`, and `ping` manage and inspect the background service used by channels, scheduled work, update checks, and browser control.
- `helios models` changes providers and models through an arrow-key flow and verifies inference before saving.
- `helios channels` lists, adds, and removes Telegram, Discord, and Slack independently of full onboarding.
- `helios tools` independently manages built-in browser and computer-use tools.
- `helios version` reports the release, source commit, and installation time from signed release metadata.
- `helios uninstall` removes the program while preserving user data; `--purge` additionally removes state and Keychain secrets after confirmation.
- `helios help` provides the complete operator command list.
- Browser control can be selected during onboarding and its authenticated localhost bridge starts with Helios.

### Changed

- `helios skills add` is now the primary spelling for verified instruction-skill installation; `install` remains accepted.
- Interactive chats reuse a running background service instead of opening duplicate channel connections.

### Security

- Process control stops only a PID whose command line is verified as the recorded Helios installation.
- Uninstall refuses source checkouts and unrecognized installation paths.
- Browser control remains disabled until explicitly enabled and uses the bundled extension instead of downloading a large executable browser runtime.

## [0.2.4] - 2026-08-05

### Fixed

- Align the legacy Unix process-discovery test with Helios's explicit Windows restart behavior.

## [0.2.3] - 2026-08-05

### Fixed

- Cross-platform operational tests now use native path and permission semantics on Windows.

## [0.2.2] - 2026-08-05

### Added

- `helios update` downloads the latest release installer, verifies its SHA-256 digest, and installs the release atomically.
- `helios doctor` performs read-only checks for configuration, credentials, channel allowlists, workspace access, database identity, permissions, and runtime ownership.
- `helios restart` verifies and stops the owned foreground Helios process before starting the newly installed CLI.

## [0.2.1] - 2026-08-05

### Fixed

- Windows CI now validates configuration persistence without applying unsupported Unix permission-bit assertions.
- GitHub workflow actions use their current Node 24-compatible major versions.

## [0.2.0] - 2026-08-05

### Added

- Arrow-key onboarding with multi-select feature, channel, and Obsidian logging choices.
- Ollama Local and Ollama Cloud model providers.
- Six-hour update checks that do not use a language model.
- Persistent user-created workers and user-defined cron jobs.
- Instruction-only skill installation from verified ClawHub cards or direct GitHub sources, with source and SHA-256 provenance.

### Security

- Guarded mode is now the default for new installations.
- Messaging channels require sender allowlists.
- Remote channel sessions cannot access workspace, browser, computer-use, delegation, or learning tools.
- Provider and channel credentials use macOS Keychain; VPS deployments use service environment variables.
- Workspace paths are checked after symlink resolution.
- Agent commands receive a minimal environment without provider or channel credentials.
- Remote Ollama endpoints require HTTPS.
- Release archives are checksum-verified before installation.
- CodeQL scanning and automated dependency update pull requests are enabled.

## [0.1.1] - 2026-08-03

### Added

- First public Helios release.
- Persistent local and optional Obsidian memory.
- OpenAI, ChatGPT/Codex OAuth, and Anthropic providers.
- Telegram, Discord, and Slack channels.
- Built-in computer use, browser bridge, delegation, and learned capabilities.
- Stable one-line installer served from the latest GitHub release.

[Unreleased]: https://github.com/aidenbuildsthings/helios/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/aidenbuildsthings/helios/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/aidenbuildsthings/helios/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/aidenbuildsthings/helios/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/aidenbuildsthings/helios/compare/v0.2.4...v0.3.0
[0.2.4]: https://github.com/aidenbuildsthings/helios/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/aidenbuildsthings/helios/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/aidenbuildsthings/helios/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/aidenbuildsthings/helios/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/aidenbuildsthings/helios/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/aidenbuildsthings/helios/releases/tag/v0.1.1
