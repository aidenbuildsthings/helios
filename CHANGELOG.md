# Changelog

## [0.9.5] - 2026-08-26

### Fixed

- Corrected the avatar from the source drawing's exact 15×16 painted matrix inside a 17×18
  transparent canvas, removing invented eye, toga, body, and foot pixels.
- Solid runs now use filled terminal cells instead of block glyphs, eliminating seams and speckles
  inside the crown, face, eyes, and clothing.

## [0.9.4] - 2026-08-26

### Changed

- The clean four-color Helios avatar now follows the original drawing at 17×18 logical pixels,
  packed into nine terminal rows so its pixels are smaller without changing the design.

## [0.9.3] - 2026-08-26

### Fixed

- Replaced the over-detailed avatar renderer with one small, direct terminal sprite using ordinary
  square color cells for predictable rendering without compositing artifacts.

## [0.9.2] - 2026-08-26

### Changed

- The Helios character is now a dedicated true-color sprite with a cleaner, symmetrical silhouette,
  stable transparent bounds, and named idle/blink frames ready for future terminal animation.

## [0.9.1] - 2026-08-26

### Fixed

- Name collection now happens only once inside onboarding; normal launches never introduce a new
  setup question.
- The Helios avatar now follows the supplied pixel grid cell-for-cell using transparent terminal
  space around its yellow hair, warm face, black eyes, and white toga.
- The composer now keeps one input rule at the bottom of the transcript and does not insert a rule
  between the user's submitted message and Helios's response.

## [0.9.0] - 2026-08-26

### Changed

- First launch now asks what Helios should call the user and keeps that chosen name in the private
  local configuration instead of guessing from the operating-system username.
- The welcome card uses a smaller, cleaner Helios avatar and replaces recent conversations with
  useful command hints.
- Chat replies now begin directly beside the Helios activity mark for a denser, easier-to-scan
  conversation flow.

## [0.8.0] - 2026-08-26

### Changed

- The conversation TUI now uses a compact Claude Code-inspired welcome panel, a transparent
  terminal-native Helios avatar, recent activity, focused help text, and a framed composer.
- Cool blue borders replace the previous orange dashboard framing while Helios keeps its solar
  gold identity.

## [0.7.0] - 2026-08-17

### Changed

- Onboarding now uses a Helios-specific solar and ancient Greek visual identity and verifies
  selected computer-control permissions before declaring setup complete.
- The conversation TUI now presents a bordered solar dashboard with model, tools, memory,
  channels, session, workspace, and approval state.
- Running `helios` on a new installation now opens onboarding automatically.

## [0.6.0] - 2026-08-17

### Changed

- The terminal experience now uses a compact session header, clearer composer, animated activity
  state, private tool trails, command history, and expanded in-session slash commands.
- Onboarding now ends with one cross-platform choice: start Helios or finish setup.
- OpenAI, ChatGPT/Codex, Anthropic, and Ollama responses now stream into the terminal.
- Ctrl+C cancels only the active turn and immediately returns to a correction prompt.
- Long sessions keep complete local history while sending a bounded, automatically compacted context.
- Tab completes slash commands. Helios releases now target macOS and Linux only.

## [0.5.1] - 2026-08-08

### Added

- Persistent cron run history, duplicate-run protection, and recovery of the most recent scheduled
  run missed during up to 24 hours of sleep or downtime.

## [0.5.0] - 2026-08-08

### Added

- Persistent model-aware subagents, automatic purpose-based delegation, and recorded task state.
- `helios subagent` interactive profile creation.

All notable Helios changes are recorded here and repeated in the corresponding GitHub release.

## [0.4.0] - 2026-08-08

### Added

- Linux Secret Service credential storage.

### Changed

- The shell installer now explicitly supports macOS and Linux and reports Linux keyring or PATH prerequisites when needed.
- Browser tokens, provider keys, OAuth sessions, and channel credentials use the native secure backend on macOS and Linux.

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

## [0.2.2] - 2026-08-05

### Added

- `helios update` downloads the latest release installer, verifies its SHA-256 digest, and installs the release atomically.
- `helios doctor` performs read-only checks for configuration, credentials, channel allowlists, workspace access, database identity, permissions, and runtime ownership.
- `helios restart` verifies and stops the owned foreground Helios process before starting the newly installed CLI.

## [0.2.1] - 2026-08-05

### Fixed

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

[Unreleased]: https://github.com/aidenbuildsthings/helios/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/aidenbuildsthings/helios/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/aidenbuildsthings/helios/compare/v0.4.0...v0.5.0
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
