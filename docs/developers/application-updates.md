<!-- Copyright 2026 o1-code contributors. SPDX-License-Identifier: Apache-2.0 -->

# Application updates

The npm launcher and the application payload have separate lifetimes. An installed base package
keeps its `cli-entry.js`; verified payloads live below the user's update directory. The launcher
selects an active payload for a fresh process, while existing conversations keep their original
runtime. See [user recovery instructions](../users/support/troubleshooting.md#application-updates)
before changing an installed environment.

## Discovery and consent

`startup/startup-prefetch.ts` discovers a version and emits `update-available`. The interactive
`/update` command emits the same event with an explicit-request marker. Discovery does not authorize
closing the application.

`ui/hooks/use-application-update.ts` owns the available, preparing, ready, failed and restarting
states. Automatic npm preparation starts only while the application is idle, with no executing
tool, active terminal, pending submission, queued message or running background task. The dialog
also waits for other dialogs and unsent text or attachments. Preparation may finish after work
resumes; it never closes that conversation automatically.

**Later** cancels restart intent, including while preparation or restart verification is in flight.
The same target stays dismissed until an explicit `/update` request. Automatic preparation follows
`general.enableAutoUpdate`; an explicit update can prepare without changing that setting. Other
installation types retain their appropriate parent-driven update or manual instructions.

## Activation invariants

`utils/managed-npm-update.ts` installs into a unique staging prefix using the npm associated with the
current Node executable. It preserves npm configuration without guessing a global installation
directory from `PATH`. Before promotion, both the package identity and actual executable are checked:

- `cli-entry.js --help` must start successfully.
- Direct `cli.js --version`, without inherited version overrides, must equal the requested version.
- A cached payload receives the same checks before reuse. A higher active version is retained only
  if it can still execute.

An invalid same-version cache is moved to a unique quarantine before the verified stage is promoted.
Failed promotion attempts restore the original directory, and failed rollback reports its retained
path. Other immutable versions remain available to running conversations. The final `active.json`
replacement is atomic; transient `EPERM`, `EACCES` and `EBUSY` failures receive five bounded retries
(50, 100, 200, 400 and 800 ms). Permanent failure retains the previous pointer and reports failure.
Standalone smoke checks also compare the runtime version with the requested release before replacing
the installation.

## Restart and session controllers

An explicit npm restart verifies the exact base bootstrap with the current Node using `--version`
and `--help`, flushes recording, and confirms that a conversation with user history has a saved
transcript. Idle state and consent are rechecked after these asynchronous operations, before cleanup.
The child receives the same session and effective approval mode, with execution options retained.
Old prompt/session selectors are removed; an empty conversation uses `--session-id` instead of
requesting a nonexistent transcript. Without recording, preparation remains available and the
conversation stays open until its natural exit.

The old process pauses stdin before spawning the inherited-terminal child and resumes it only when
that child settles. Unmounting the UI and removing listeners alone does not stop the Windows console
reader; leaving it active can consume the new application's keystrokes.

Fresh worker launches use that installation's bootstrap and clear only their inherited runtime pin.
Existing workers, PTY hosts and controller internals retain their own runtime. A capable controller's
status advertises protocol, bootstrap and Node identity so it can be reused across payload versions
only within the same installation and runtime.

A reachable legacy controller is never shut down for an update: its owner-disconnect handlers can
terminate foreground conversations even if shutdown requests preserve workers. An updated client
opens a direct session until that controller exits. Do not replace this fallback with a list-then-
shutdown sequence; inspecting sessions and disconnecting their owners is not atomic.

`scripts/cli-entry.js` also re-enters the exact npm bootstrap with the same Node after parent-driven
updates. Selecting a vaguely related command on `PATH` can relaunch an entirely different Node
installation. Standalone installations retain their validated bundled-Node shim.

## Regression validation

Use an isolated application home, npm prefix, registry and local provider. Pack the real bundle and
keep its SHA-256 fixed while testing. Registry/provider fixtures can control discovery and responses;
do not change package manifests or version output to represent a successful installed update.

The required behavioral checks are:

1. Start an older published package, prepare the candidate, and verify fresh `--version`, `--help`
   and a real conversation response followed by a clean process exit.
2. Hold a provider response while discovery finishes. Verify no preparation or modal until idle;
   then exercise Later, continued conversation, explicit reopening and restart.
3. Verify the new application header, identical saved session, effective approval mode and a follow-up
   provider request containing prior conversation history. Check runtime arguments as well as labels.
4. Keep an old controller and worker alive during activation. Verify they retain their identity and
   respond, while a fresh launch uses the candidate.
5. Corrupt a same-version cache, inject a staged runtime mismatch, and hold the active pointer open.
   Verify quarantine/recovery, rejection without pointer changes, bounded retry and permanent failure.
6. Exercise conventional and manager-controlled installations, spaces/non-ASCII prefix paths and
   unprivileged recovery from a prefix that cannot be written. Do not delete settings or unrelated
   global packages to recover.

The October 2026 validation used installed artifacts on macOS ARM64 with nvm, Windows 11 ARM64 in
Parallels with Scoop/fnm/Volta/nvm-windows, x64 Node under Windows ARM64 emulation, and Debian 12
ARM64 under Colima. Native execution, injected faults and simulated registry/provider responses
are distinct evidence types. This does not establish native Windows 10/x64, corporate endpoint
policy, every Node release, or every installation manager. The focused tests next to the updater,
restart helper, hook, dialog, startup, command and session-controller modules preserve the contracts.

| Environment                              | Runtime and installation coverage                                     | Observed checks                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| macOS ARM64                              | nvm, Node 22.23.3, isolated npm prefix                                | Busy discovery, Later/reopen, restart, saved history, PLAN and explicit false options, clean exit                                      |
| Windows 11 ARM64                         | Scoop, fnm, Volta and nvm-windows CLI/shims                           | Successive managed updates; stale interactive runtime reproduction; runtime mismatch, cache repair and actual transient pointer lock   |
| Windows 11 ARM64 with x64 Node emulation | Node 22.23.3                                                          | Installed candidate version/help and activation fault cases; this is not native x64 Windows                                            |
| Debian 12 ARM64 under Colima             | Node 22.23.4/npm 10.9.9, conventional and custom prefixes, nvm 0.40.8 | Successive updates, version/help, provider response with clean exit, cache reuse, runtime mismatch rejection and unprivileged recovery |

The final local validation tarball's SHA-256 (not a published release checksum) was
`b74dca195c5ded11731e33011dac88738067aad6b91a524d05748ebe7fab3b98`.
Earlier activation fault and manager cases also used preceding candidates; the Linux nvm/read-only
matrix used `24781ec132ad6ed4b247aa96c08651cfd51d5ab580abb0ee5cdf76ff07fc33ef` before the final
attachment and stdin handoff fixes. Linux conventional/wrong-runtime checks were repeated with
`dc1364501a14b240fe421b6943f824c919fad8bc3ef5f96c0eae9a9e00799079` before the final compact-layout
changes. Those results do not constitute re-execution of every manager with the final archive.
The Windows nvm-windows CLI/shim checks do not establish a completed
interactive installer/UAC workflow.
