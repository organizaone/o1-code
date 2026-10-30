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
  - A: O1-Code checks for a newer release at startup when `general.enableAutoUpdate` is enabled. An update dialog appears when the session is idle, with no tools running. It shows the current and available versions and lets you restart to update or choose **Later**. Supported npm installations can prepare the update in the background while idle; the prepared version takes effect on the next startup. `/update` opens the same flow, including when automatic updates are disabled. See [Application updates](#application-updates) below for installation-specific recovery. If you run from a clone, pull the latest changes, then run `corepack pnpm install --frozen-lockfile`, `npm run build -- --cli-only` and `npm run bundle`.

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

## Application updates

The update dialog waits until the agent, tools, queued messages and background tasks have finished.
It also waits for other dialogs to close and for the input to be empty. Use arrows and Enter to
choose an action; Escape means **Later**. Run `/update` to reopen a dismissed update. A dismissed
version does not repeatedly reopen its dialog in the same application session.

With `general.enableAutoUpdate: true`, supported npm installations can download and verify an update
while idle. **Preparing the update** refers to that work; **Ready to restart** means the new files
are prepared, while the current session still runs its original version. Choosing **Later** during
preparation cancels a requested restart and allows preparation to finish. It does not cancel your
conversation. A prepared update applies the next time you open O1-Code. Other installation types
offer the appropriate restart action or manual instructions instead of npm background preparation.

Setting `general.enableAutoUpdate` to `false` disables automatic startup checks and preparation.
You can still run `/update` and explicitly choose to update. A failed preparation shows its reason
and keeps the current version available. Retry through the dialog, or follow its manual instructions;
Page Up/Page Down scroll longer details, and Home/End reach their beginning or end.

If conversation recording is disabled, **Prepare update** downloads the npm update without closing
the current conversation. Apply it on your next natural startup. For npm installations, restarting a
recorded conversation keeps its saved history and current approval mode, together with the original
execution options.
An empty new conversation can restart without requiring a saved transcript.

### The base npm version differs from the application version

An npm installation retains its original launcher and prepares application versions separately under
`~/.o1-code/updates/npm/` (under `O1CODE_HOME` when configured). For example, `npm list -g` can show
`0.21.10` while `o1-code --version` and the running application show `0.21.12`. This is expected when
the launcher has selected a verified managed update. The npm package listing alone does not show
which application payload runs.

Verify a fresh launch from a new terminal outside an existing O1-Code session:

```bash
o1-code --version
o1-code --help
```

Both checks matter: a readable package manifest is insufficient if the underlying code cannot start.
An already-running session and commands it launches may intentionally retain their original version
until restarted. A new conversation opened after activation should use the updated version even when
the sessions controller remains open. If a legacy controller is still managing older conversations,
the updated application opens a direct session until that controller exits; it does not stop those
conversations to replace the controller. Updated controllers launch new conversations through the
current bootstrap only for the same installation and Node runtime. Updating a different Node
installation also does not change the installation your current terminal resolves.

### An update finishes but a fresh launch still runs the old version

First identify the actual command and npm prefix. On macOS or Linux:

```bash
type -a o1-code node npm
npm config get prefix
npm root -g
```

In Windows PowerShell:

```powershell
Get-Command o1-code,node,npm -All | Select-Object Name,Source
npm.cmd config get prefix
npm.cmd root -g
```

Use `.cmd` wrappers when PowerShell's execution policy blocks npm's `.ps1` wrapper. Compare these
paths with the Node version manager and installation you intended to use. A second installation
earlier on `PATH` can hide the one you updated. Select the intended Node version with your manager,
open a new terminal, and retry `/update` from that installation. To reinstall its base npm package,
use the matching npm in that same environment:

```bash
npm install --global @organizaone/o1-code@latest
```

On Windows use `npm.cmd install --global @organizaone/o1-code@latest`. Check the prefix before
running the command, then repeat the fresh `--version` and `--help` checks afterward. Replacing the
base launcher invalidates its previous managed-update selection; a fresh launch then uses the
reinstalled base until another managed update is prepared.

Manager-specific details explain why paths can differ:

- [nvm](https://github.com/nvm-sh/nvm#usage) keeps global packages with each Node installation;
  switching Node can select a different copy of O1-Code.
- [Scoop's Node manifest](https://github.com/ScoopInstaller/Main/blob/master/bucket/nodejs-lts.json)
  configures persistent npm directories. The global prefix can be outside the directory containing
  `node.exe`; inspect npm's resolved prefix rather than assuming those directories are adjacent.
- [nvm-windows](https://github.com/nvm-windows/nvm/wiki/Common-Issues) documents conflicts when an
  earlier Node installation takes precedence on `PATH`.
  Its version 2 shim policy can also block a newly installed module before O1-Code starts. If its
  diagnostics report `NVM4306` for the package you installed, use the manager's specific module trust
  and reshim commands (`nvm firewall trust module o1-code`, then `nvm reshim`); this is separate from
  downloading an application update.
- [Volta](https://docs.volta.sh/guide/understanding) routes package commands through shims and pins
  tools to a Node engine. Use the manager's intended command rather than another npm found on `PATH`.

### Preparation fails, or a cached update cannot start

Keep the error text and installation paths when reporting the problem. Include the OS, Node/npm
versions, Node manager, command-resolution results, current and target O1-Code versions, and whether
the failure happened during preparation or restart. Registry/network failures and filesystem errors
require different remedies.

The managed npm updater checks the downloaded runtime and any cached payload before reuse. A broken
same-version payload is retained under a unique `.broken-VERSION-*/payload` directory beside the
managed version directories while a verified replacement is promoted. If promotion fails, it tries
to restore the previous directory; an unsuccessful restoration reports the retained recovery path.
Preserve that path when seeking help. There is no need to erase all settings, the manager's complete
`node_modules`, or the entire update directory as a first recovery step.

On Windows, file locks can prevent the final update selection from being replaced. The updater
retries transient `EPERM`, `EACCES` and `EBUSY` errors for a bounded period; a persistent failure is
reported instead of being called a successful update. Resolve the specific file access reported by
the error, then retry. Similar rename failures are documented in
[npm's issue tracker](https://github.com/npm/cli/issues/9021); that failure class does not establish
the cause of every update problem.

## Terminal layout and Windows commands

If borders, choices or input lines become displaced, record the terminal application's name and
version, Windows or macOS version, `o1-code --version`, `node --version`, terminal dimensions and the
steps that triggered the problem. Note whether it followed resizing, sleep/resume, a long input or
an opened dialog. Include a screenshot with credentials and private project information removed.

On Windows, try `ui.glyphs: "compat"` in your user settings when symbols render incorrectly, then
restart the CLI. This changes the interface's symbols; it does not select the command shell. For
duplicated streaming lines, the incremental-rendering diagnostic in the FAQ above is a separate
setting. Report which setting changed the result.

To select the agent's command shell, open `/settings`, find **Agent Shell**, choose the shell and
restart the CLI. Automatic selection on Windows prefers installed Git Bash, then Command Prompt.
PowerShell can be selected explicitly. **Agent Shell Executable** accepts an absolute executable
path when a shell is explicitly selected. These settings belong in user or system configuration;
project settings cannot override them. The terminal application hosting O1-Code and the agent's
command shell are separate choices.

When reporting shell failures, include the selected shell, its resolved executable and version,
the exact command, working directory, output and exit code. For a cancellation issue, record the
test process PID before pressing Esc and check that specific PID afterward. A list of unrelated
`node.exe` processes cannot establish whether cancellation worked.

If the issue concerns sleep prevention, record `general.preventSystemSleep`, whether work was
active, and whether the system actually slept. Recovery after a frozen process and prevention of
system sleep are separate behaviors. Maintainers use the
[Windows validation guide](../../guides/WINDOWS-VALIDATION.md) to reproduce these scenarios.

## Common error messages and solutions

- **Error: `params must have required property 'file_path'` or `Model response mixed incompatible XML and structured tool calls.`, sometimes accompanied by XML tool-call tags.**
  - **Cause:** A model can emit tool instructions in the text channel instead of structured arguments, or send an empty structured call alongside those instructions. This is a protocol-format problem, not evidence that the file is missing.
  - **Handling:** O1-Code recovers parameterized `<invoke name="...">` and `<tool_call><function=...>` calls outside fenced examples, keeps protocol tags out of the streamed conversation, and converts numeric and boolean arguments according to the tool schema. An accompanying empty structured call is reconciled with the XML once, preserving its call ID. One empty placeholder can also represent multiple XML calls to the same tool when there are no populated native calls alongside it; the first recovered call retains the native ID and additional calls receive distinct IDs. Argument validation and permissions still apply. Ambiguous mixtures remain rejected. Incomplete XML and invalid argument buffers have bounded retries; repeated tool calls also remain subject to loop detection and the per-turn tool-call cap. Keep those protections enabled when troubleshooting a model that repeats failed calls.

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

If you encounter an issue that was not covered here in this _Troubleshooting guide_, consider searching the O1-Code [Issue tracker on GitHub](https://github.com/organizaone/o1-code/issues). If you can't find an issue similar to yours, consider creating a new GitHub Issue with a detailed description. Pull requests are also welcome!
