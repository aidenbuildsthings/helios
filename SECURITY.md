# Helios Security

Helios is security-focused, but no autonomous agent or software system can be guaranteed unhackable. Treat every model response, message, webpage, file, and downloaded skill as potentially hostile.

## Default boundaries

- New installations use guarded approval mode.
- Local tools are scoped to the configured workspace and resolve symlinks before access.
- Commands do not inherit provider or channel credentials.
- Remote channel senders must be explicitly allowlisted.
- Remote sessions do not receive file, command, browser, computer-use, delegation, learning, or skill tools.
- Downloaded skills are instructions only. Helios does not install or execute their scripts, plugins, or package hooks.
- Browser and Ollama Local listeners bind to loopback. Never expose them directly to a public network.
- Secrets use macOS Keychain, Windows DPAPI, or Linux Secret Service. Headless Linux/VPS operators can supply secrets through the service environment; Helios does not write them to its JSON configuration.

## VPS deployment

Run Helios as a dedicated unprivileged user. Keep the workspace narrowly scoped, use guarded mode, deny inbound network traffic by default, and expose no Helios or Ollama port publicly. Use dedicated bot accounts and provider keys with spending limits. Put remote administration behind SSH or a private overlay network.

Container or OS-level sandboxing is still recommended for untrusted workloads. Helios approval controls reduce risk but are not a kernel security boundary.

## Reporting vulnerabilities

Do not open a public issue for an exploitable vulnerability. Use GitHub private vulnerability reporting in the repository Security tab.
