# Changelog

All notable Helios changes are recorded here and repeated in the corresponding GitHub release.

## [Unreleased]

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

[Unreleased]: https://github.com/aidenbuildsthings/helios/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/aidenbuildsthings/helios/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/aidenbuildsthings/helios/releases/tag/v0.1.1
