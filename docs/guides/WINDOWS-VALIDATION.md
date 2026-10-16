<!-- Copyright 2026 o1-code contributors -->

# Windows validation

Use this procedure for changes to Windows shells, process handling, native APIs or terminal
rendering. Select the scenarios affected by the change; the full core and CLI suites remain CI-only.
Rendering rules live in [TUI design](TUI-DESIGN.md), implementation rules in
[the stack guide](STACK-O1-CODE.md#windows-rules), and completion requirements in
[Task completion](TASK-COMPLETION.md#deviations-in-this-project).

## Environment and isolated installation

Record the commit, package version and hash, Windows version and build, architecture, Node version
and executable, terminal application and version, dimensions, glyph mode and selected agent shell.
Record the shell's actual executable and version as well: a Bash family label does not identify its
distribution, and a version-manager shim may resolve differently in another session.

The `O1-Code` Parallels VM is a maintainer environment, not a required VM name. Check that the VM is
running before dispatching tests. The October 2026 validation used Windows 11 ARM64 and Node
24.22.0; that observation establishes neither Windows 10 coverage nor x64 coverage. Use a supported
Node release and add another architecture or runtime when the changed native dependency requires it.

Prepare the package on the development host, one heavy job at a time:

```bash
mkdir -p ops/windows-validation
npm run build -- --cli-only
npm run bundle
npm run prepare:package
npm pack ./dist --pack-destination ./ops/windows-validation
shasum -a 256 ops/windows-validation/*.tgz
```

Copy the resulting archive into the guest. Install it into a separate directory using the guest's
Node/npm, allowing normal install scripts and native optional dependencies. Do not copy the host's
`node_modules`: macOS native modules cannot validate Windows execution. In an interactive PowerShell
session, substitute the archive path below:

```powershell
$validationRoot = Join-Path $env:LOCALAPPDATA 'o1-code-validation'
$installRoot = Join-Path $validationRoot 'install'
npm install --prefix $installRoot 'C:\path\to\organizaone-o1-code-VERSION.tgz' --no-audit --no-fund
$env:HOME = Join-Path $validationRoot 'home'
$env:O1CODE_HOME = Join-Path $env:HOME '.o1-code'
$cli = Join-Path $installRoot 'node_modules\@organizaone\o1-code\cli.js'
node $cli --version
```

Create the isolated home, disposable project and settings with editing/file tools before launching
the session. Preserve the real `USERPROFILE`: replacing it can prevent registered Store executables
from starting with `EPERM`. Keep shell tests in both a local project and, when relevant, a shared UNC
project. Use a local fixture provider with dummy credentials for deterministic tests, disable updates
and telemetry, and enable feedback statistics only in the feedback fixture. Discard or reset test
settings between scenarios so previous answers and feedback cooldowns do not affect the result.

Run the installed entry point with `node $cli` from the disposable project. Verify version output
and package identity before testing behavior. A copied development bundle with reused dependencies
can diagnose a rendering issue, but record that installation separately from a fresh tarball install.

## Host regression checks

After building and bundling, the development host can run:

```bash
npx playwright install chromium
node --import tsx integration-tests/terminal-capture/terminal-layout-regression.ts feedback
node --import tsx integration-tests/terminal-capture/terminal-layout-regression.ts question
node --import tsx integration-tests/terminal-capture/terminal-layout-regression.ts resize
```

Set `O1CODE_TUI_E2E_OUT` to retain screenshots, visible text and raw output. These scenarios use a
fake provider and six conversation turns. Run scoped tests next to the affected source, from
`packages/cli` or `packages/core`, as described in the stack guide.

The current capture scenarios were validated on the macOS host. Their preload argument uses a
host filesystem path; do not assume they are a ready-made Windows runner. A native Windows driver
must pass ESM preload paths through `pathToFileURL(preload).href` and use the guest's native PTY
dependency. It can reuse `integration-tests/fake-openai-server.ts` and the scenario assertions.

## Native scenario matrix

| Area                  | Exercise                                                                                                                                                             | Required observations                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell selection       | Automatic selection with Git Bash installed; explicit PowerShell and CMD; explicit executable when relevant; restart between selections.                             | Actual interpreter and arguments match the setting; workspace configuration cannot override the selection.                                                                                                                  |
| Arguments and paths   | Spaces, accents, quotes, a native `/flag` and local/UNC working directories.                                                                                         | The fixture receives the original arguments and intended working directory. Record MSYS conversion; apply `MSYS_NO_PATHCONV=1` only to a command that needs native slash switches. CMD rejects UNC execution before launch. |
| Cancellation          | Start a disposable parent and child that print their PIDs and periodic output; cancel with Esc.                                                                      | Both recorded PIDs terminate, partial output remains in conversation history, and no missing-result repair replaces the cancellation result.                                                                                |
| Internal diagnostics  | Trigger an unavailable-command lookup during a session.                                                                                                              | The lookup's stdout/stderr stay captured; no raw `where.exe` error is written over the input or frame.                                                                                                                      |
| Long questions        | Fill history, scroll away from the latest turn, then deliver a 35-line question. Page up/down, use the wheel and toggle full detail.                                 | The question becomes visible; every line remains reachable; active selection and controls remain visible; the transcript does not consume the question's scroll events.                                                     |
| Custom answers        | Enter a wrapped answer containing spaces, accents and CJK text.                                                                                                      | The visible input fits its reservation and submits the complete original answer exactly once.                                                                                                                               |
| Feedback              | Use a controlled fixture to meet eligibility and open the survey after a long history; dismiss by typing.                                                            | Header, history, input and actions remain aligned; the dismissing character remains in the input. A survey that never opened is not a passing test.                                                                         |
| Long input and resize | Paste text containing accents and an unbroken path; resize 100×30 → 80×24 → 60×18 → 100×30; submit.                                                                  | Header and both frames stay visible, border columns match the grid, controls remain accessible and the provider receives the complete original input.                                                                       |
| Plugin choices        | Use long names and 20-line descriptions at 80×24, 80×16 and 60×12; page descriptions, wrap selection, select and cancel.                                             | Complete descriptions remain reachable, controls fit, and callbacks receive the intended selection or cancellation. Component fixtures complement the real CLI scenarios.                                                   |
| Symbol widths         | Exercise relevant full and compat glyphs, including feedback and footer rows near terminal width.                                                                    | No extra column advance, wrapped actions or stale borders. Plain symbols omit unnecessary selectors on Windows; emoji text selectors remain intact.                                                                         |
| Subagent dashboard    | Run two agents reporting explicit progress; switch tabs without leaving the roster, enter details, return with Esc, and resize 120×40 → 70×24 → 120×40. | Filled active tab and primary shortcuts remain distinct; the roster count stays pinned; all frame edges retain their columns and long details remain reachable. |
| Wake recovery         | Freeze the test process long enough to exceed the heartbeat threshold, resume it, then type.                                                                         | The current tree is repainted completely, unchanged borders return and input remains usable. Record the actual gap.                                                                                                         |
| Sleep prevention      | With the feature enabled, observe power requests during active work, completion and cancellation. Exercise optional-native-binding absence separately when relevant. | Requests are acquired and released with work; the unavailable-binding path follows its documented diagnostic behavior. Recovery after a pause does not prove prevention of sleep.                                           |
| Clipboard             | Use synthetic empty, Unicode text, padded registered PNG and bitmap-only clipboard fixtures; exercise the shipped image worker and attachment save after isolated npm installation. Test cancellation, busy/unavailable access and existing destination files in scoped regressions. | Text and PNG bytes survive intact; bitmap PNG dimensions and decoded pixels match. No external clipboard-addon runtime is required on Windows. Failures preserve unrelated files, release owned resources and distinguish unavailable access from no image. |
| Bundled search        | Start without a global `rg`; search a file whose path contains spaces and accents. On Windows ARM64, test a usable native executable and the missing-native-runtime path; retain system-only selection tests. | The packaged executable runs and returns the expected match. ARM64 is preferred; the bundled x64 executable is health-probed before system fallback. No technical startup warning appears when functional fallback is available; diagnostics remain inspectable. |

Use the production feedback hook with controlled eligibility/randomness in an isolated process;
forcing a dialog directly does not verify the transition that changes composer height. For layout,
assert geometry and controls as well as text markers: all expected words can survive in a corrupted
frame. Keep native fixture overrides and any temporary PATH adjustments in the evidence. Repeat the
final scenario without diagnostic output filtering or workarounds that hide the defect.

Clipboard fixtures replace the test guest's clipboard; use synthetic data and do not capture a user's
clipboard contents as evidence. Record whether the machine lacks the matching Visual C++ runtime:
the October 2026 Windows 11 ARM64/Node 24.22.0 isolated npm validation exercised PNG, bitmap, text,
the shipped worker and bundled x64 search without adding that runtime. A read-only inspection of a
separate Node 24.18.0 installation established the old addon loader failure; it did not validate an
updated installation there.

## Driver details that affect results

- Send typed characters and Enter as separate input events with enough time for the guest to process
  them. A transport that batches them together can trigger paste detection and insert a newline
  instead of submitting. Use bracketed paste deliberately for paste scenarios.
- If a long quoted `prlctl exec` invocation fails, prepare a short `.cmd` wrapper with an editor,
  copy it to the guest and invoke that path. Do not keep changing shell escaping blindly.
- A frozen event loop longer than ten seconds exercises the heartbeat recovery path. A `SIGCONT`
  test on macOS exercises the signal path. Neither is evidence of physical Windows sleep/resume.
- A missing execution result, PID, exit code or final frame is incomplete evidence. Do not infer that
  a process started, exited or was cancelled from a transport interruption alone.
- Shut down only fixture processes whose ownership is recorded. Await their exit and retain their
  status; unrelated `node.exe` processes may belong to the user's sessions.

## Evidence and completion

| Evidence                                                  | What it establishes                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Scoped tests with platform mocks                          | Branch behavior and layout contracts under the mocked platform.                                       |
| Real CLI in a host PTY with xterm.js                      | CLI composition and captured geometry for that runtime and emulator.                                  |
| Native Windows CLI/ConPTY, decoded in host xterm.js       | Native process execution and the Windows-generated terminal stream; host rendering remains emulated.  |
| Capture of the actual Windows terminal application        | Its font, glyph and viewport appearance for the observed frame and scenario.                          |
| Controlled process pause                                  | Heartbeat-gap recovery for the measured pause.                                                        |
| Observed physical sleep/resume or power-request lifecycle | The specific system behavior or request lifecycle that was actually observed. Record them separately. |

Save the environment, exact commands or fixture parameters, raw output, visible frames, screenshots,
exit codes, recorded process IDs and scoped assertions under an ignored evidence directory such as
`ops/windows-validation/`. Give each scenario its own directory. Keep reusable regressions in the
versioned test tree; ignored local drivers are evidence helpers, not a required public test command.
Remove credentials and private workspace content before sharing artifacts.

Report each applicable scenario as passed, failed or not run, with its evidence type and any
remaining limitation. Preserve before/after evidence for a reproduced defect. A successful version
command is an installation smoke check, not proof of interactive behavior. Push, PR and release
authorization still follow Task completion; native validation does not change that boundary.
