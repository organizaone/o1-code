# @organizaone/o1-code-web-shell

The browser UI for `o1-code serve`: a chat and terminal interface for daemon sessions, built on the
TypeScript SDK's daemon client. The daemon serves it at `/` by default (`--no-web` turns it off), and
it can also be embedded in another React application as a component.

The package is not published to npm yet. To embed it, build it from this repository
(`npm run build --workspace=@organizaone/o1-code-web-shell`) and depend on it and on
`packages/sdk-typescript` by path. Render `WebShellWithProviders` with the daemon's `baseUrl`, a
`token` and a `sessionId`; the token grants the browser full daemon authority, so embed it only for a
trusted single operator. When the page and the daemon use different origins, start the daemon with
`--allow-origin <page-origin>`. Sidebar options are the `WebShellSidebarOptions` type in
[`client/App.tsx`](client/App.tsx).

Requires Node.js 22 or later and a current evergreen browser.
