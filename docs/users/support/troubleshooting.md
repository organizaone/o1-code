# Troubleshooting

This guide provides solutions to common issues and debugging tips, including topics on:

- Authentication or login errors
- Frequently asked questions (FAQs)
- Debugging tips
- Existing GitHub Issues similar to yours or creating new Issues

## Authentication or login errors

- **Error: `401 Unauthorized` or `Invalid API key` right after connecting a provider**
  - **Cause:** The API key is wrong, expired, or belongs to a different endpoint than the base URL you configured.
  - **Solution:** Run `/auth` again and re-enter the key, or check the environment variable named by `envKey` in your `modelProviders` entry. Make sure the base URL matches the provider that issued the key.

- **Error: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, or `unable to get local issuer certificate`**
  - **Cause:** You may be on a corporate network with a firewall that intercepts and inspects SSL/TLS traffic. This often requires a custom root CA certificate to be trusted by Node.js.
  - **Solution:** Set the `NODE_EXTRA_CA_CERTS` environment variable to the absolute path of your corporate root CA certificate file.
    - Example: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Error: `Connection error. (cause: fetch failed)` against a self-signed endpoint**
  - **Cause:** You are pointing O1-Code at a self-hosted server (for example a local model behind `https://`) whose TLS certificate is self-signed, so Node.js rejects it.
  - **Solution:** Prefer trusting the certificate via `NODE_EXTRA_CA_CERTS` (above). If that is not practical in a trusted lab/private network, skip verification with the `--insecure` flag (or `O1CODE_TLS_INSECURE=1`):
    - Example: `o1-code --insecure --openaiBaseUrl https://192.168.1.10:8080 ...`
    - **Warning:** Disabling verification removes protection against man-in-the-middle attacks. Only use it for endpoints you fully trust.

- **Issue: Unable to display UI after authentication failure**
  - **Cause:** If authentication fails after selecting an authentication type, the `security.auth.selectedType` setting may be persisted in `settings.json`. On restart, the CLI may get stuck trying to authenticate with the failed auth type and fail to display the UI.
  - **Solution:** Clear the `security.auth.selectedType` configuration item in your `settings.json` file:
    - Open `~/.o1-code/settings.json` (or `./.o1-code/settings.json` for project-specific settings)
    - Remove the `security.auth.selectedType` field
    - Restart the CLI to allow it to prompt for authentication again

## Frequently asked questions (FAQs)

- **Q: How do I update O1-Code to the latest version?**
  - A: O1-Code checks npm for a newer release at startup and updates itself unless `general.enableAutoUpdate` is `false`. To update by hand, run `/update` inside O1-Code or `npm install -g @organizaone/o1-code@latest`. If you run it from a clone, pull the latest changes, then run `corepack pnpm install --frozen-lockfile`, `npm run build -- --cli-only` and `npm run bundle`.

- **Q: Where are the O1-Code configuration or settings files stored?**
  - A: The O1-Code configuration is stored in two `settings.json` files:
    1. In your home directory: `~/.o1-code/settings.json`.
    2. In your project's root directory: `./.o1-code/settings.json`.

    Refer to [O1-Code Configuration](../configuration/settings.md) for more details.

- **Q: Why don't I see cached token counts in my stats output?**
  - A: Cached token information is only displayed when cached tokens are being used. It depends on the provider supporting prompt caching. You can still view your total token usage using the `/stats` command.

- **Q: Lines appear duplicated or out of place while a response streams. What can I do?**
  - A: The interface redraws only the lines that changed between frames, which some terminals or terminal multiplexers track incorrectly. Start one session with `O1CODE_INCREMENTAL_RENDERING=0` to confirm; if the display is correct again, set `ui.incrementalRendering` to `false` in `settings.json`. The interface then erases and redraws the whole screen on every frame, which costs more data and can flicker in terminals without synchronized output.

- **Q: A customization (extension, hook, skill, MCP server, or subagent) seems to be breaking O1-Code. How do I isolate it?**
  - A: Start O1-Code with the `--safe-mode` flag to disable all customizations — context files, hooks, extensions, skills, MCP servers, custom subagents (only built-in subagents load), permission rules, settings-sourced approval mode overrides, memory features, and sandbox settings — for the session. Note: the CLI flags `--yolo` and `--approval-mode` still take effect in safe mode. If the problem disappears in safe mode, re-enable your customizations one at a time to find the culprit.
    - Example: `o1-code --safe-mode`
    - Alternative: set the environment variable `O1CODE_SAFE_MODE=true` if the CLI cannot accept flags.
    - Note: "MCP servers" here means servers configured in `settings.json` / project `.mcp.json` — local, ambient state that safe mode is meant to isolate against. MCP servers you explicitly supply for the current invocation (an embedding ACP client's `session/new` `mcpServers`, or `--mcp-config`) are not local/ambient state and are still honored under safe mode.

## Common error messages and solutions

- **Error: `EADDRINUSE` (Address already in use) when starting an MCP server.**
  - **Cause:** Another process is already using the port that the MCP server is trying to bind to.
  - **Solution:**
    Either stop the other process that is using the port or configure the MCP server to use a different port.

- **Error: Command not found (when attempting to run O1-Code with `o1-code`).**
  - **Cause:** The CLI is not correctly installed or it is not in your system's `PATH`.
  - **Solution:**
    - Check that npm's global binary directory (`npm prefix -g`, plus `/bin` on macOS and Linux) is in your `PATH`, and restart your terminal.
    - Reinstall with `npm install -g @organizaone/o1-code@latest`, or run it without installing: `npx @organizaone/o1-code@latest`.
    - From a clone of the repository, run `npm link` after `npm run bundle`, or run the bundle directly with `node dist/cli.js`. See [Build from source](../../developers/build-from-source.md).

- **Error: `MODULE_NOT_FOUND` or import errors.**
  - **Cause:** Dependencies are not installed correctly, or the project hasn't been built.
  - **Solution:**
    1.  Run `npm install` to ensure all dependencies are present.
    2.  Run `npm run build` to compile the project.
    3.  Verify that the build completed successfully with `npm run start`.

- **Error: "Operation not permitted", "Permission denied", or similar.**
  - **Cause:** When sandboxing is enabled, O1-Code may attempt operations that are restricted by your sandbox configuration, such as writing outside the project directory or system temp directory.
  - **Solution:** Refer to the [Configuration: Sandboxing](../features/sandbox.md) documentation for more information, including how to customize your sandbox configuration.

- **O1-Code is not running in interactive mode in "CI" environments**
  - **Issue:** O1-Code does not enter interactive mode (no prompt appears) if an environment variable starting with `CI_` (e.g. `CI_TOKEN`) is set. This is because the `is-in-ci` package, used by the underlying UI framework, detects these variables and assumes a non-interactive CI environment.
  - **Cause:** The `is-in-ci` package checks for the presence of `CI`, `CONTINUOUS_INTEGRATION`, or any environment variable with a `CI_` prefix. When any of these are found, it signals that the environment is non-interactive, which prevents the CLI from starting in its interactive mode.
  - **Solution:** If the `CI_` prefixed variable is not needed for the CLI to function, you can temporarily unset it for the command. e.g. `env -u CI_TOKEN o1-code`

- **DEBUG mode not working from project .env file**
  - **Issue:** Setting `DEBUG=true` in a project's `.env` file doesn't enable debug mode for the CLI.
  - **Cause:** The `DEBUG` and `DEBUG_MODE` variables are automatically excluded from project `.env` files to prevent interference with the CLI behavior.
  - **Solution:** Use a `.o1-code/.env` file instead, or configure the `advanced.excludedEnvVars` setting in your `settings.json` to exclude fewer variables.

- **Trackpad scrolling in tmux changes prompt history instead of scrolling the conversation**
  - **Issue:** In a tmux session, trackpad or wheel scrolling may cycle through previous prompts, similar to pressing `Up Arrow` or `Down Arrow`.
  - **Cause:** tmux can translate wheel gestures into plain arrow-key sequences. Those sequences are indistinguishable from real arrow-key presses by the time o1-code receives them.
  - **Solution:** If screen reader mode is disabled, make sure `ui.useTerminalBuffer` is enabled; then use `Shift+Up` / `Shift+Down`, or the mouse wheel when tmux forwards wheel events to the app (requires `ui.mouseTracking`). If you prefer host scrollback, adjust your tmux mouse bindings for wheel events.

- **Right-click does nothing, links do not open, or text cannot be selected in the terminal**
  - **Issue:** Native right-click context menus, OSC 8 hyperlink clicks, and terminal-native text selection stop working while O1-Code is running.
  - **Cause:** When `ui.mouseTracking` is enabled (the default), O1-Code captures all mouse events via SGR mouse tracking to power in-app text selection, click-to-position, row hover, history-item toggling, and viewport scrolling. The terminal forwards every mouse event to the app instead of handling it natively. O1-Code supplies its own replacements while tracking is on: a single click opens an http(s) OSC 8 hyperlink, and right-click on a link or text selection opens an in-app context menu.
  - **Solution:** If you prefer the terminal's native handling, set `"ui.mouseTracking": false` in your `settings.json`. This turns off all in-app mouse interaction, including the in-app link open and context menu. In Virtualized History (`ui.useTerminalBuffer: true`, the default), the wheel will no longer scroll the transcript — use `Shift+↑/↓`, `PgUp/PgDn`, or `Ctrl+Home/End` instead. To also restore native terminal scrollback, set `"ui.useTerminalBuffer": false`. Requires restart.

## IDE Companion not connecting

- Ensure VS Code has a single workspace folder open.
- Restart the integrated terminal after installing the extension so it inherits:
  - `O1CODE_IDE_WORKSPACE_PATH`
  - `O1CODE_IDE_SERVER_PORT`
- If running in a container, verify `host.docker.internal` resolves. Otherwise, map the host appropriately.
- Reinstall the companion with `/ide install` and use “O1-Code: Run” in the Command Palette to verify it launches.

## Exit Codes

The O1-Code uses specific exit codes to indicate the reason for termination. This is especially useful for scripting and automation.

| Exit Code | Error Type                 | Description                                                                                         |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | An error occurred during the authentication process.                                                |
| 42        | `FatalInputError`          | Invalid or missing input was provided to the CLI. (non-interactive mode only)                       |
| 44        | `FatalSandboxError`        | An error occurred with the sandboxing environment (e.g. Docker, Podman, or Seatbelt).               |
| 52        | `FatalConfigError`         | A configuration file (`settings.json`) is invalid or contains errors.                               |
| 53        | `FatalTurnLimitedError`    | The maximum number of conversational turns for the session was reached. (non-interactive mode only) |

## Debugging Tips

- **CLI debugging:**
  - Use the `--verbose` flag (if available) with CLI commands for more detailed output.
  - Check the CLI logs, often found in a user-specific configuration or cache directory.

- **Core debugging:**
  - Check the server console output for error messages or stack traces.
  - Increase log verbosity if configurable.
  - Use Node.js debugging tools (e.g. `node --inspect`) if you need to step through server-side code.

- **Tool issues:**
  - If a specific tool is failing, try to isolate the issue by running the simplest possible version of the command or operation the tool performs.
  - For `run_shell_command`, check that the command works directly in your shell first.
  - For _file system tools_, verify that paths are correct and check the permissions.

- **Pre-flight checks:**
  - Always run `npm run preflight` before committing code. This can catch many common issues related to formatting, linting, and type errors.

## Existing GitHub Issues similar to yours or creating new Issues

If you encounter an issue that was not covered here in this _Troubleshooting guide_, consider searching the O1-Code [Issue tracker on GitHub](https://github.com/silvioricardo87/o1-code/issues). If you can't find an issue similar to yours, consider creating a new GitHub Issue with a detailed description. Pull requests are also welcome!
