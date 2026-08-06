# Changelog

All notable Helios changes are recorded here and repeated in the corresponding GitHub release.

## [Unreleased]

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

[Unreleased]: https://github.com/aidenbuildsthings/helios/compare/v0.2.4...HEAD
[0.2.4]: https://github.com/aidenbuildsthings/helios/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/aidenbuildsthings/helios/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/aidenbuildsthings/helios/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/aidenbuildsthings/helios/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/aidenbuildsthings/helios/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/aidenbuildsthings/helios/releases/tag/v0.1.1
