<!-- Copyright 2026 o1-code contributors -->

# Agent session runtime

## Architecture

The accepted feature card is [issue #99](https://github.com/organizaone/o1-code/issues/99).
The CLI starts one ordinary interactive worker per managed conversation through the existing
Agent View PTY supervisor. A foreground controller attaches one terminal at a time. The dashboard
changes that attachment without cancelling the outgoing worker's turn or shell command.

The normal Ink frontend, session-local configuration, command loader and model stream remain in
each worker. A native `/resume` changes the configuration of one frontend and cannot preserve a
second running turn. Reusing `serve` would require replacing the current frontend's central
interactive flow; the PTY supervisor preserves it. `serve` remains the Web Shell and remote runtime.

`/agents` opens the workspace-grouped session dashboard; `/sessions` is its alias. `/subagents`
opens the specialized subagent manager, and `/tasks` retains its existing behavior. The old
`/agents manage` and `/agents create` forms remain compatible.

## Terminal and process ownership

The foreground controller serializes attach and detach, waits for the outgoing detach
acknowledgment and restores the previous attachment if selection fails. The supervisor owns
worker output and redraw requests; terminal input goes only to the attached worker.
Independently running direct TUI processes are discoverable but cannot be taken over.

An authenticated owner connection binds managed conversations to their foreground CLI window.
Closing that window stops its conversations, including detached work. Opening a detached managed
conversation in another window transfers ownership. A session with a live attachment cannot be
claimed by another window. Stopping uses the existing graceful control and bounded termination
fallback; a worker may remain alive briefly while termination completes.

The supervisor persists the foreground owner in session state. After a supervisor restart, it
stops conversations whose owner connection was lost. Unowned supervisor jobs retain their
existing lifecycle. This prevents an interrupted stop from leaving a managed worker running
indefinitely after the next supervisor startup.

Managed startup requires an interactive terminal with PTY support. Before the first attachment,
an unavailable runtime falls back to a direct session. Worker processes bypass managed startup
to prevent recursive spawning. Saved conversations resume through their own persisted session.

Empty interactive invocations and invocations using only `--yolo` or `-y` start the managed
frontend. The requested approval mode is recorded in the worker launch for subsequent resumes.
Interactive attachment starts once the PTY host is available, before worker readiness: startup
questions and terminal background queries need the attached terminal to complete. Readiness
registration and cwd validation remain active; background dispatch still waits for readiness.

The catalog omits sessions without a user prompt, a goal objective or a pending user request,
including newly opened and renamed empty terminals. On attachment, the frontend restores its
viewport and reloads the effective theme from user/workspace settings, never from conversation
history. `/theme` starts in workspace scope when a trusted, active workspace defines the theme;
otherwise it starts in user scope.

## State and resource limits

Workers report readiness, heartbeats, model identity, theme, language, activity and input state
through authenticated sideband events. The dashboard shows observed model identity; unknown
values remain unknown. Redraw-only polling preserves queued prompt and stop controls.

Admission is serialized and defaults to three live managed workers.
`O1CODE_MAX_MANAGED_SESSIONS` accepts values from 1 to 8. Existing output rings and bounded
catalog/transcript reads constrain retained terminal and discovery data. Each live conversation
still requires its own CLI process, so memory grows with worker count; the cap is the admission
guard, not a guarantee of constant memory.

## Validation evidence

Native Windows validation used Node 22.23.3 and the compiled CLI:

- Opened `/agents` and `/sessions`, resumed a saved conversation and returned to the original
  worker. A shell command with a delayed completion continued while detached and displayed its
  completion after switching back.
- Confirmed terminal attach/detach cycles and repaint at different column widths while retaining
  the worker process identity.
- Forced the foreground process to exit, then verified `stopped/exited` and the absence of the
  worker process after the graceful termination deadline.
- Killed the supervisor with a live worker, restarted it and verified recovery to `stopped/exited`.
  Repeated recovery for a stop interrupted before its termination fallback completed.
- Checked isolated ownership, transfer, startup failure, admission limits and persisted recovery
  with focused tests alongside the affected source files.

The lifecycle checks used an isolated configuration home; its worker reached setup input rather
than a model turn. These runs prove process and terminal behavior, not a completed provider turn.
The switcher was also exercised with configured local sessions and real shell commands. No full
product regression suite was run.

Native WSL validation used Ubuntu 26.04, Node 22.23.3, the packaged Linux CLI and a real tmux
terminal. It covered grouped workspaces, search, saved-session resume, arrow navigation, narrow
layouts, `/subagents manage` and `/tasks`. Twelve repeated switches retained the same two worker
processes; individual switches took roughly 0.65–1.22 seconds. Delayed shell commands completed
while detached, and closing the foreground window stopped both workers and an active shell child.
The combined resident memory of the controller, supervisor, two workers and their PTY hosts grew
from roughly 900 MiB to 992 MiB during the short switching run. This is a warm-up observation,
not a sustained memory-leak benchmark.

The session-startup fixes were exercised with a packaged Linux CLI in WSL and a controlled local
OpenAI-compatible provider. Checks covered YOLO startup, an empty catalog, saved-session resume,
switching back to the same live worker PID, refreshed theme preferences, restored alternate-screen
mode and a new model request after switching. This fixture validates the provider transport and
frontend lifecycle without a paid external model.

These runs exposed and corrected shell activity reported as idle, navigation order differing from
workspace grouping, and conversation history remaining above the subagent manager. The manager
selection screen now uses its group headings without a duplicate generic title. The installed
application was exercised again after each correction; no additional unit suite was run.

The configured MiMo provider rejected the isolated credential with HTTP 401, including a direct
provider request. No successful provider-backed model turn is claimed. Credentials were copied
only into the isolated validation home and removed after the run.

The initial Windows baseline measured roughly 113–197 MiB for a blank CLI worker during startup
and 97–127 MiB for its PTY host. These observations are directional and were not a sustained
multi-model memory benchmark.
