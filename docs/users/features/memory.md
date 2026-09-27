# Memory

Every O1-Code session starts with a fresh context window. Two mechanisms carry knowledge across sessions so you don't have to re-explain yourself every time:

- **AGENTS.md** — instructions _you_ write once and O1-Code reads every session
- **Auto-memory** — notes O1-Code writes itself based on what it learns from you

---

## AGENTS.md: your instructions to O1-Code

AGENTS.md is a plain text file where you write things O1-Code should always know about your project or your preferences. Think of it as a permanent briefing that loads at the start of every conversation. It is a shared convention — other coding agents read the same file, so a project that already has one needs no o1-code-specific duplicate.

### What to put in AGENTS.md

Add things you'd otherwise have to repeat every session:

- Build and test commands (`npm run test`, `make build`)
- Coding conventions your team follows ("all new files must have JSDoc comments")
- Architectural decisions ("we use the repository pattern, never call the database directly from controllers")
- Personal preferences ("always use pnpm, not npm")
- A verification policy for high-stakes work — for example "verify against the database before concluding" (see [Enforce evidence-based conclusions](../common-workflow.md#enforce-evidence-based-conclusions) for a ready-made template)

Don't include things O1-Code can figure out by reading your code. AGENTS.md works best when it's short and specific — the longer it gets, the less reliably O1-Code follows it.

### Where to create AGENTS.md

| File                            | Who it applies to                             |
| ------------------------------- | --------------------------------------------- |
| `~/.o1-code/AGENTS.md`          | You, across all your projects                 |
| `AGENTS.md` in the project root | Your whole team (commit it to source control) |

O1-Code also walks upward from the current directory to the project root, and loads `AGENTS.md` from any include directory you've added (see [`context.includeDirectories`](../configuration/settings.md)). You can have any combination of these — O1-Code loads all of them when you start a session. The `context.fileName` setting lets you point at a different file name instead.

### Generate one automatically with `/init`

Run `/init` and O1-Code will analyze your codebase to create a starter `AGENTS.md` with build commands, test instructions, and conventions it finds. It never replaces a non-empty `AGENTS.md` — including one already written for another AI tool — but instead offers to append an `## o1-code` section, headed by the note "Instructions for o1-code only. Other agents may ignore this section."

### Reference other files

You can point AGENTS.md at other files so O1-Code reads them too:

```markdown
See @README.md for project overview.

# Conventions

- Git workflow: @docs/git-workflow.md
```

Use `@path/to/file` anywhere in AGENTS.md. Relative paths resolve from the AGENTS.md file itself.

---

## Auto-memory: what O1-Code learns about you

Auto-memory runs in the background. After each of your conversations, O1-Code quietly saves useful things it learned — your preferences, feedback you gave, project context — so it can use them in future sessions without you repeating yourself.

This is different from AGENTS.md: you don't write it, O1-Code does.

### What O1-Code saves

O1-Code looks for four kinds of things worth remembering:

| What                    | Examples                                                 |
| ----------------------- | -------------------------------------------------------- |
| **About you**           | Your role, background, how you like to work              |
| **Your feedback**       | Corrections you made, approaches you confirmed           |
| **Project context**     | Ongoing work, decisions, goals not obvious from the code |
| **External references** | Dashboards, ticket trackers, docs links you mentioned    |

O1-Code doesn't save everything — only things that would actually be useful next time.

### Where it's stored

Auto-memory files live at `~/.o1-code/projects/<project>/memory/`. All branches of the same checkout share the same memory folder, so what O1-Code learns in one branch is available in others. Each linked git worktree gets its own memory folder, matching the per-worktree isolation of chats and other session state — repository-wide conventions you want in every worktree belong in [team memory](#team-memory-shared-with-collaborators).

Everything saved is plain markdown — you can open, edit, or delete any file at any time.

#### Pinned memory

Put hand-curated documents that automatic memory maintenance should preserve
under `pinned/` in a managed-memory directory, for example
`~/.o1-code/projects/<project>/memory/pinned/architecture.md` or
`~/.o1-code/memories/pinned/preferences.md`. Use the same frontmatter as other
memory documents. Valid pinned files are readable by O1-Code and are included the
next time `MEMORY.md` is rebuilt, under the same size and file-count limits as
other memory documents.

Only the top-level `pinned/` directory directly inside a managed-memory root is
protected; nested directories such as `memory/project/pinned/` are ordinary
writable memory. Automatic extraction and Dream workers match the reserved
directory name case-insensitively.

Automatic extraction is instructed to leave pinned records and their valid
index entries unchanged, while Dream is instructed to skip `pinned/` during
consolidation. Both automatic extraction and forked Dream workers, including
background cleanup, enforce the pinned-file boundary on their write and edit
tools, including paths that resolve through a symlink into `pinned/`; their
existing read-only shell policy blocks command-line deletion. You still control
these files directly and can remove them with an explicit `/forget` request.

> **Note:** The visible `/dream` slash command runs on the main Agent. It
> receives the same skip instruction, but does not yet receive the forked
> worker's deterministic per-turn tool gate.

### Periodic cleanup

O1-Code periodically goes through its saved memories to remove duplicates and clean up outdated entries. This runs automatically in the background once a day after enough sessions have accumulated. You can trigger it manually with `/dream` if you want it to run now.

Your session continues normally while cleanup runs in the background.

### Turning it on or off

Auto-memory is on by default. To toggle it, open `/memory` and use the switches at the top. You can turn off just the automatic saving, just the periodic cleanup, or both.

You can also set them in `~/.o1-code/settings.json` (applies to all projects) or `.o1-code/settings.json` (this project only):

```json
{
  "memory": {
    "enableManagedAutoMemory": true,
    "enableManagedAutoDream": true
  }
}
```

### Team memory (shared with collaborators)

By default, auto-memory is **private to you** — it lives under your home directory and is never shared. Team memory is an opt-in tier that the whole team shares **through git**.

When enabled, O1-Code gains a third memory directory at `.o1-code/team-memory/` **inside the repository**. It uses the same one-file-per-memory layout and `MEMORY.md` index as the private tiers. Because it is committed to the repo, it is shared with every collaborator the normal way: you `git pull` to receive teammates' memories and commit/push to share yours. O1-Code routes durable, project-wide knowledge here — conventions every contributor must follow, shared reference pointers (trackers, dashboards) — while personal and fast-decaying notes stay private.

Enable it per project (or globally) in `settings.json`:

```json
{
  "memory": {
    "enableTeamMemory": true
  }
}
```

It is **off by default**. Keep these caveats in mind:

- **It is source-controlled and visible to everyone with repo access.** Treat a team memory like committing to the repo.
- **Secrets are blocked.** Writes to `.o1-code/team-memory/` are scanned for credentials (API keys, tokens, private keys); a detected secret is rejected, never written. The scan is a backstop, not a guarantee — don't put sensitive data there.
- **Changes are reviewable.** Team memory writes appear in `git status` / the PR diff like any other file, so they can be reviewed before they're committed. In the default approval mode O1-Code also asks before each team write; in `AUTO_EDIT`/YOLO mode (where you've opted into auto-approval) they are applied without a prompt but still surface in the diff.
- **The directory must be git-tracked.** If your project's `.gitignore` excludes `.o1-code/*`, re-include the path so it can be shared:

  ```gitignore
  !.o1-code/team-memory/
  !.o1-code/team-memory/**
  ```

  Caveat: use the file-glob ignore form (`.o1-code/*`), not a directory form with a trailing slash (`.o1-code/`). A directory-form ignore makes git skip the folder entirely, so a `!`-reinclude below it is a no-op and the team tier stays silently empty in git. O1-Code warns once at startup when the tier is enabled but its directory is git-ignored or outside any git repository, so this misconfiguration does not pass unnoticed.

`O1CODE_MEMORY_TEAM=1` / `=0` overrides the setting for a single run.

### Automatic git sync (optional)

By default you share team memory with the normal git workflow (`pull` to receive, `commit`/`push` to share). To have O1-Code do it for you, enable sync:

```json
{
  "memory": {
    "enableTeamMemory": true,
    "enableTeamMemorySync": true
  }
}
```

When on, at session start O1-Code best-effort syncs the `.o1-code/team-memory/` directory: it rebuilds the shared `MEMORY.md` index, fast-forward-pulls collaborators' updates **first**, then commits your team-memory changes on top, and pushes **only that sync commit** (via an explicit single-branch refspec) — so the index you load reflects the latest. It only **stages** the team directory (your other working changes are never committed), and never blocks the session on a git failure. Off by default. `O1CODE_MEMORY_TEAM_SYNC=1` / `=0` overrides the setting for a single run.

Two things to know before enabling it:

- **The fast-forward pull acts on your whole current branch, not just `.o1-code/team-memory/`** (git has no path-scoped pull). So sync will fast-forward your branch to the remote tip. The push, by contrast, is scoped: it publishes **only the commit this sync just created**, so it never pushes other unpushed commits you have — if your branch is already ahead of upstream, sync commits locally and skips the push. Enable it on branches where the fast-forward pull is fine — or run it on a dedicated checkout.
- **A diverged branch is left untouched** (`--ff-only` never merges). When that happens sync simply does nothing that session; resolve the divergence (`git pull`) and it resumes. A branch with no upstream (no tracking configuration) still commits locally but skips the push — there is nowhere to push to.

---

## Commands

### `/memory`

Opens the Memory panel. From here you can:

- Turn auto-memory saving on or off
- Turn periodic cleanup (dream) on or off
- Open your personal AGENTS.md (`~/.o1-code/AGENTS.md`)
- Open the project AGENTS.md
- Browse the auto-memory folder

### `/init`

Generates a starter `AGENTS.md` for your project — O1-Code reads your codebase and fills in build commands, test instructions, and conventions it discovers. It never replaces a non-empty `AGENTS.md`; if one already exists, it offers to append an `## o1-code` section instead, headed by the note "Instructions for o1-code only. Other agents may ignore this section."

### `/remember <text>`

Immediately saves something to auto-memory without waiting for O1-Code to pick it up automatically:

```
/remember always use snake_case for Python variable names
/remember the staging environment is at staging.example.com
```

### `/forget <text>`

Removes auto-memory entries that match your description:

```
/forget old workaround for the login bug
```

### `/dream`

Runs the memory cleanup now instead of waiting for the automatic schedule:

```
/dream
```

---

## Troubleshooting

### O1-Code isn't following my AGENTS.md

Open `/memory` to see which files are loaded. If your file isn't listed, O1-Code can't see it — make sure it's in the project root or `~/.o1-code/`.

Instructions work better when they're specific:

- ✓ `Use 2-space indentation for TypeScript files`
- ✗ `Format code nicely`

If you have multiple AGENTS.md files with conflicting instructions, O1-Code may behave inconsistently. Review them and remove any contradictions.

### I want to see what O1-Code has saved

Run `/memory` and select **Open auto-memory folder**. All saved memories are readable markdown files you can browse, edit, or delete.

### O1-Code keeps forgetting things

If auto-memory is on but O1-Code doesn't seem to remember things across sessions, try running `/dream` to force a cleanup pass. Also check `/memory` to confirm both toggles are enabled.

For things you always want O1-Code to remember, add them to AGENTS.md instead — auto-memory is best-effort, AGENTS.md is guaranteed.
