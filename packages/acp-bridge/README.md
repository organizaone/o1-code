# `@organizaone/o1-code-acp-bridge`

The bridge between the `o1-code serve` HTTP daemon and the `o1-code --acp` child process: ACP
channel lifecycle, session multiplexing, the per-session event bus, multi-client permission
mediation, and the filesystem seam shared by the daemon and the VS Code companion.

It lives in the monorepo and is not published to npm. The package exports a root barrel and
per-module subpaths (`/eventBus`, `/channel`, `/permission`, `/bridge`, and others) that re-export
the same symbols.

Options are declared in [`src/bridgeOptions.ts`](src/bridgeOptions.ts); the HTTP
protocol the daemon exposes over it is in
[`docs/developers/o1-code-serve-protocol.md`](../../docs/developers/o1-code-serve-protocol.md).
