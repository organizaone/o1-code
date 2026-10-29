# TUI design

The reference for anyone changing the terminal interface: the Ink/React code in
`packages/cli/src/ui`. It states the design rules as the code implements them, and the reason
behind the ones that are easy to undo by accident. Paths below are relative to
`packages/cli/src/ui/` unless they start at the repository root.

The Web Shell (`o1-code serve`) has its own interface and is not covered here.

## Ground rules

- A terminal is a grid: one font size, normal and bold, no letter spacing. "Typography" here is the
  choice of glyph, colour and weight.
- **Target width: 120 columns.** Below that the screen drops items by fixed bands (see
  [Layout tiers](#layout-tiers)). No row may exceed the terminal width at any width.
- **Full-screen layout** (`ui.useTerminalBuffer`, on by default): header pinned at the top, input and
  footer pinned at the bottom, the conversation scrolls in between and sticks to its last line.
- The full-screen application paints the active theme's canvas inside its viewport. The legacy
  layout and `NO_COLOR` leave the terminal background untouched. A selected tab may use a filled
  accent chip with contrasting text to identify the active view.
- Colours come from theme tokens, never from literals in a component.

## Colour

Two themes with the same roles: `themes/o1-code-dark.ts` (the default) and
`themes/o1-code-light.ts`. The light one applies when the user picks it, or picks `auto` and the
terminal reports a light background. `themes/o1-code-palette.test.ts` pins the values and checks
every light-theme text colour at 4.5:1 or more on `#f7f9fc`.

Roles live in two places: `SemanticColors` (`theme.*`, `themes/semantic-tokens.ts`) and
`ExtendedColors` (`extendedTheme.*`, `themes/extended-tokens.ts`) for the roles the inherited set did
not have. Themes that do not declare extended colours get them derived from their palette.

| Role            | Token                                            | Dark      | Light     | Used for                                                                                   |
| --------------- | ------------------------------------------------ | --------- | --------- | ------------------------------------------------------------------------------------------ |
| primary text    | `theme.text.primary`                             | terminal  | `#162033` | main text, selected item, titles                                                           |
| secondary text  | `theme.text.secondary`                           | `#95a5be` | `#46546d` | unselected items, queued messages                                                          |
| muted           | `extendedTheme.text.muted`                       | `#8593aa` | `#56637b` | labels, hints, metadata                                                                    |
| placeholder     | `extendedTheme.text.placeholder`                 | `#7a879e` | `#65728a` | input placeholder                                                                          |
| separator       | `extendedTheme.ui.separator`                     | `#52679c` | `#9fadca` | `·` and `│`, empty bar cells, inactive chips                                               |
| rule            | `extendedTheme.ui.rule`, `theme.border.default`  | `#46598a` | `#a3b4d2` | conversation border, autocomplete box, unfocused input                                     |
| brand           | `extendedTheme.ui.brand`, `theme.border.focused` | `#6e9bff` | `#2b5bd7` | logo, `❯`, selection arrow, focused input, dialogs asking a choice                         |
| brand soft      | `extendedTheme.ui.brandSoft`                     | `#8fb2ff` | `#2f5fdb` | default/auto mode label, active skill, update notice, user message text, `monitoring` chip |
| accent (purple) | `theme.text.accent`                              | `#a48bff` | `#6547c9` | branch, memory bar, assistant `◆`, `@path` and `/command` in input                         |
| code (teal)     | `theme.text.code`                                | `#3fc7d6` | `#0a6d78` | inline code and paths                                                                      |
| success         | `theme.status.success`                           | `#3fd07f` | `#157a44` | online, added lines, current model dot                                                     |
| warning (amber) | `theme.status.warning`                           | `#ffa347` | `#9a5200` | MCP offline, Safe/Debug Mode, warnings                                                     |
| error           | `theme.status.error`                             | `#ff6b6b` | `#c02d2d` | failure, removed lines, provider error                                                     |

**Why the dark theme's primary text is empty:** the full-screen canvas supplies the theme's
foreground (`#e6ecf5`) as the inherited default, while the legacy layout continues to use the
terminal foreground. Explicit semantic colours override that default.

**Chrome keeps a contrast floor of 1.8:1 against the backgrounds it can land on** (`separator` and
`rule`, dark on `#0a1220`/`#212734`/`#1e1e1e`, light on `#f7f9fc`/white — pinned in
`themes/o1-code-palette.test.ts`). The legacy layout still uses the terminal background, so these
checks include common terminal profiles as well as the theme canvas.

With 256 or 16 colours, chalk (under Ink) reduces each token to the nearest ANSI colour. The product
has no colour detection of its own and nothing is designed for 16 colours on purpose.

### Activity categories

Every tool belongs to a category (`utils/activity-category.ts`, from the tool's `Kind` in core). The
same colour and label appear on the tool row and on the activity-line chip.

| Category  | Colour token               | Kinds                      | en / pt label        |
| --------- | -------------------------- | -------------------------- | -------------------- |
| `info`    | `activity.info` (brand)    | thinking, answering, other | info / info          |
| `read`    | `activity.read` (teal)     | Read, Search, Fetch        | reading / leitura    |
| `write`   | `activity.write` (purple)  | Edit, Delete, Move         | writing / escrita    |
| `execute` | `activity.execute` (amber) | Execute                    | running / executando |
| `success` | `activity.success` (green) | explicit completion        | done / sucesso       |

States outside the categories: failed (`✗`, error colour), canceled (`○`, muted), pending (`●`,
muted — not the separator colour, so the label stays legible), awaiting approval (spinner in amber,
plus `awaiting approval` after the target).

## Logo and wordmark

`utils/logo-font.ts` defines a 4-pixel font drawn with half blocks (`▀ ▄ █`): two terminal rows,
one blank column between letters. `components/O1Logo.tsx` renders it; "O1" and the final dot in
brand, "-CODE" in primary text.

```
█▀█ ▀█      █▀▀ █▀█ █▀▄ ██▀
█▄█ ▄█▄ ▀▀▀ █▄▄ █▄█ █▄▀ █▄▄ ▄
```

Under 80 columns it becomes `O1Wordmark`: `O1-CODE.` in bold on one line, same colours.

Rejected, so they do not come back: a drop shadow (too heavy for a 4-px font, needs per-cell
background colour, and opens gaps in fonts with taller line height), italics, gradients, a
box-drawing outline, and the 6-row "ANSI Shadow" font.

### Logo animation

On the start screen the logo animates **once**, then rests as the static logo; looping distracts.
It runs only in the full-screen layout, at 80 columns or more (under that the wordmark shows), outside
screen-reader mode, in an interactive session, with the conversation still empty, and when
`ui.logoAnimation` is not `off`. It stops at the first key, or when the first message arrives or the
terminal drops under 80 columns, and never starts again in the session.

`ui.logoAnimation` is `random` (the default, one drawn per session), `off`, or one of:

- `come`: the C turns amber, opens and closes its mouth and eats O, D, E and the dot; the letters
  blink back.
- `pulo`: O1 hops two pixel rows; on landing CODE squashes for two frames and the dot pops up.
- `digita`: the letters are typed one by one behind a blinking brand block cursor.
- `tetris`: the letters fall into place one at a time; the completed row flashes once.
- `compila`: brand-coloured noise settles into the logo.
- `chuva`: teal drops fall down each column; the logo pixels they pass stay lit.
- `bola`: the dot bounces along the tops of the letters to the O and back, then lands.
- `onda`: each letter lifts one pixel row and drops, left to right.

Constraints, so an animation never breaks the layout:

- It draws in the blank row above the pinned header and the two logo rows, nothing else. While it
  plays the header renders that blank row itself, so the header height never changes.
- Only `▀ ▄ █` and space; a cell whose two pixels differ is `▀` over a background.
- 8 frames per second (125 ms).
- Colours are tokens (`brand`, `primary`, `warning`, `code`, `muted`, `bright`) resolved to the theme.

The frames are pure functions in `utils/logo-animation.ts`, which reuses the glyphs of
`utils/logo-font.ts`; `components/AnimatedLogo.tsx` owns the timer and
`hooks/use-logo-animation.ts` decides when it plays.

## Product icon

`scripts/o1/generate-icons.mjs` regenerates every icon from the same pixel font, as SVG paths (never
`<text>`, so no icon depends on installed fonts). Colours: background `#0a1220`, brand `#6e9bff`,
foreground `#e6ecf5`, on a rounded square.

- **Symbol**, "O1" alone, for 32 px and under, where "CODE" cannot be read.
- **Full mark**, "O1" over "CODE", from 48 px up.

The script's header lists the copies it does not rewrite (the Web Shell favicon and sidebar);
`--print` shows what to paste there.

## Layout

Top to bottom, in full-screen mode:

1. **Header** (`components/Header.tsx`), pinned, with a blank row above and below.
2. **Conversation** (`components/ConversationWell.tsx`): a box in `rule` colour taking all free
   height, so its border reaches the input even when the history is short. Under the history, the
   thinking line, separated by one blank row and marked with the queued arrow; at the bottom, the queue.
3. **Activity line** (`components/ActivityLine.tsx`), directly above the input
   border. The composer's single blank row separates it from the conversation;
   there is no additional blank row below the chips.
4. **Input** (`components/InputPrompt.tsx`, `BaseTextInput.tsx`).
5. **Footer** (`components/Footer.tsx`, `footer-zones.tsx`).

While a tool waits for approval, or a dialog is open, the input, activity line and footer are not
rendered; the approval box or dialog takes their place. Provider selection,
authentication progress, authentication errors and theme selection also hide the full-screen
conversation frame, including on unauthenticated startup. Closing authentication
restores the transcript and queue. In scrollback mode and screen-reader mode
the header is not pinned, and the update notice renders as its own box above the input.

Feedback visibility participates in composer-height measurement: opening or closing the
optional survey reserves or releases its rows before the conversation settles. Wake recovery
asks Ink to invalidate its incremental cache and render the current tree over a clean viewport;
replaying captured terminal writes cannot reconstruct a frame from partial row updates.

Height budgets include the pinned header, frame, notices and controls before allocating scrollable
content. Re-measure when an optional control appears or disappears. A pending question brings itself
into view and owns keyboard and wheel scrolling until answered; the surrounding transcript must
not consume those same events. Full-detail mode preserves the confirmation's finite height budget.

### Header

Each row has an independent left and right side: a long item on the right never squeezes the left.

| Row | Left           | Right                                                                                                 |
| --- | -------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | logo, row 1    | `v0.1.0 · ORGANIZAONE`, bold, muted (from `brand.json` and `package.json`)                            |
| 2   | logo, row 2    | `memory 6.2 / 16 GB` and an 8-cell purple bar (machine RAM)                                           |
| 3   | empty          | notices, only when present: `↑ v… available · /update` (brand soft), `● N MCP offline · /mcp` (amber) |
| 4   | shortcut hints | workspace path: parents muted, folder bold primary                                                    |

Hints: `esc cancel · shift+tab mode · / commands · @ files · ← agents`, key in secondary, label
in muted, `·` in separator. Hints are dropped whole from the end until the folder name fits. The
path loses its start first (`…\pessoal\o1-code`); the folder always shows. Outside Windows the home
directory becomes `~`. No usage meter, user name or sandbox indicator; the banner customisation
settings (`ui.customAsciiArt`, `ui.hideBanner`, …) are gone and ignored if present.

### Conversation

- **User message:** a bar (`glyphs().userBar`, `▎`, `│` in compatible mode) in brand on every line,
  then `❯` in brand and the text in brand soft, so a prompt stands apart from the reply and the
  tool rows without painting a background. The message that started the running turn
  shows the turn's state in that column (`utils/turn-marker.ts`): a spinner in brand while nothing
  has appeared under it yet, `❯` again with a muted `…` after the text once the agent shows
  something, and `✓` (`glyphs().done`) in brand once the turn ends. A cancelled or failed turn
  leaves `❯`, as do messages restored from an earlier session (`hooks/use-turn-outcome.ts` records
  the outcome on the item).
- **Tool row** (`shared/ToolStatusIndicator.tsx`): marker in the category colour, label padded to
  11 columns so tool names line up, then the tool and its target. A spinner replaces the marker
  while it runs, with the elapsed time. Under 40 columns of content only the marker stays.
- **Thinking** (`components/ThinkingLine.tsx`): spinner, then `thinking… 8s · esc to cancel` in muted
  italic (a loading phrase replaces `thinking…` unless loading phrases are off).
- **Assistant reply:** `◆` (`glyphs().agent`, `*` in compatible mode) in accent (purple), markdown
  rendered for the terminal, streamed.
- **Status lines** (`messages/StatusMessages.tsx`): info `●`, success `✓`, warning `!`, error `✕`,
  retry `↻`. The warning prefix is ASCII on purpose: `△` drew two columns in Windows Terminal and
  broke the conversation's right border.
- **Update notice** (`messages/UpdateNotice.tsx`): an update of O1-Code itself gets a frame, brand
  (red when it failed), with the title set into the top edge in bold primary: `Update` with
  `✓ O1-Code X installed` (success mark) and `It takes effect the next time you open O1-Code.`
  (muted), or `What's new in X` on the first run of a new version, with `Updated from A to X`,
  up to four highlights (brand dot, primary text) and `and N more · full notes: <url>`. The
  highlights are the first sentence of each entry of the version's `CHANGELOG.md` section, which
  the bundle carries as `release-notes.json`; the version the last run opened is kept in
  `~/.o1-code/last-seen-version`.
- **Provider error being retried** (`messages/ProviderRetryBox.tsx`): red box, the reason, a live
  `Retrying in Ns — esc to give up (attempt/max)`, then `Retrying…` with a spinner. The footer shows
  failed meanwhile.

### Summary display mode

`ui.displayMode` is `detailed` (the default, everything above) or `summary`. Ctrl+O always shows the
Detailed view, so the transcript is the same in both modes (`hooks/use-display-mode.ts`).

- **Step rows** (`messages/SummaryToolGroupDisplay.tsx`): the category marker and label of a tool row,
  then one sentence on the step's purpose: the `intent` the model gave with the call, sanitized to one
  line, or a fallback from `utils/summary-label.ts` (`Changing login.ts`, `Running npm test` — the
  program and its subcommand, never the other arguments). A muted file name and `+N −M` follow when
  the step changed a file. Consecutive reads and searches share one row with `· N files`. No diff,
  file body, shell output or arguments. An error adds its first line in red.
- **Kept as in Detailed:** approvals, the user's own `!` commands, a focused shell, the parallel-agent
  roster, and results that already summarize (todo list, plan, findings, subagents, question answers).
- **Approvals** keep the amber frame and every option and outcome. An edit shows `Change file`, the
  file and `+N −M`, then the intent, and adds `View changes`, which opens and closes the diff inside
  the box without answering. A shell approval shows the intent above the full command, which never
  hides.
- **Replies:** each fenced code block folds into one muted row, `▸ code ts · 12 lines · ctrl+o`; the
  text around it stays.

### Queue

During a turn, `enter` steers the running turn and `ctrl+q` queues the message. The queue
(`components/QueuedMessageDisplay.tsx`) sits at the bottom of the conversation box, one message per
line: `↳` in brand, text in secondary. The last line carries `N queued · ↑ edit` on the right, and
`… N more ·` before it when more than three are waiting (three lines at most). When the turn ends,
the first item becomes the next turn's message.

Keep the queue inside the conversation box: below or above the activity line it broke the grouping
of the status rows right above the input.

### Activity line

- Left: the five category chips. The active one has its dot in the category colour and its label
  bold primary; the others a separator-coloured dot and a muted label. Active is the category of
  the running tool, `info` while the agent thinks or answers, none when idle.
- After the chips, while monitors watch: `● monitoring (N)` in brand soft bold. The background
  tasks pill on the right then leaves running monitors out of its count.
- **Reaching the background tasks:** while background work runs, the first ↑ from an empty
  composer focuses them (the
  `monitoring` chip, or the pill when no monitor runs), shown in inverse with
  `enter open · ↑ history · esc back`; Enter opens the dialog, ↓ or Esc goes back to the input,
  and ↑ goes on into history. `/tasks` opens the same dialog. ↓ no longer reaches them: they sit
  above the input.
- Right, each only when present: background tasks pill, `plan 2/4` (count bold primary), active
  skill (`● name`, brand soft bold, no "skill" label), goal, scheduled tasks, skills pending review,
  active workflow. A blocked Goal stays until the user acts, so its pill ends with a muted
  `· /goal clear`, and its card in the conversation adds a `Next:` line with the commands it
  accepts: `/goal resume`, `/goal edit <objective>` and `/goal clear`.

### Input

- Rounded border in brand when focused, `rule` otherwise; `❯` in brand in every approval mode (the
  mode shows in the footer). Shell mode swaps the prompt for `!` in its own colour.
- **Placeholder by state**, in the placeholder colour: idle `Type your message or @path/to/file`; in a turn
  `enter steers the turn · ctrl+q queues`; with vim on, the vim hint.
- **One cursor.** On Windows the input draws no cursor of its own: every Windows terminal runs
  through ConPTY, the terminal cursor already sits at the insertion point, and the zero-width space
  an end-of-line drawn cursor needs is one column wide to ConPTY, which pushes the full-width input
  row over the edge and parks the terminal cursor on the right border. Elsewhere a drawn cursor
  (block, or underline under tmux) sits on the same cell as the terminal's. See
  `terminalShowsInputCursor` in `utils/software-cursor.ts`.
- `@path` and `/command` tokens in accent. A large paste becomes a `[Pasted Content N chars]` token.
- The buffer wraps at the box's inner edge — the full terminal width minus
  border, padding and prefix (`calculatePromptWidths`). A fraction of the
  width left a dead column band on the right of every wrapped line.
- **Session name:** set into the top border on the right (`/rename`); the rule before it takes only
  the room the name leaves, so the border keeps the input's width.
- **Prompt history:** bare ↑ on the first visual row recalls an older prompt; bare ↓ on the last
  visual row recalls a newer one, restoring the draft after the newest. Inside multiline input they
  move the cursor. The top border shows `history 1/50` while recalling, newest first. Transcript
  scrolling uses the mouse, Page Up/Down or Shift+↑/↓.
- **End-of-line cursor:** a styled space and nothing after it. A zero-width space used to follow
  it: Ink counts U+200B as one column and VTE (GNOME Terminal, Ptyxis) as none, which pulled the
  right border in by one column.
- **Selecting text:** with mouse tracking on, a drag over the typed text selects it like the
  conversation does (same highlight, copied on release); a click without a drag places the cursor,
  on release, so it never repaints a selection being made.
  Rendered borders, including the user-message bar, are non-selectable; a bar typed into the
  message remains part of the copied text.
- **Multiline:** grows up to 6 visible lines (`INPUT_MAX_VISIBLE_LINES`). With more than one line,
  `N lines · enter sends · shift+enter new line` shows on the right; scrolled, the first visible row
  is `↑ N lines above`.
- **Attachments** (`InputPrompt.tsx`): one per row above the box, names aligned
  under the label. A screenshot saved from the clipboard shows the time it was
  taken (`screenshot 17:12`, localized) instead of its generated
  `clipboard-<timestamp>-<uuid>.png` name; any other file keeps its name,
  trimmed in the middle to 16 columns so the start and the extension stay. The
  file on disk is never renamed. Ready files use the read accent, a file icon,
  their size when available, and a localized ready label; selection adds a
  background highlight. Image preparation shows an animated spinner and elapsed
  time above the input. Enter waits for preparation; Esc cancels it without
  clearing the draft. Failed preparation remains visible until another paste or
  Esc. Native image extraction runs in a worker so the input remains responsive.
  Incremental text pastes show a spinner and the number of received KB in the
  same area; the footer keeps its model and usage zones visible.

Real application captures: [attachment preparation](../images/tui-attachment-preparation.png)
and [ready attachment](../images/tui-attachment-ready.png).

### Footer

Three zones spread across the width (`footer-zones.tsx`):

1. **Mode:** `● AUTO` bold — brand soft for default and auto, amber for edits, red for YOLO, green
   for plan — then `│`, the model name alone (no provider; `—` without one), `· reasoning high`,
   `· summary` in brand soft when the Summary display mode is set (Detailed adds nothing), and
   `Safe Mode` / `Debug Mode` when on.
2. **Git:** `⎇ main` in accent, `+31` green `-6` red: the working-tree diff. A worktree shows its
   own branch. The folder is not repeated here; it is in the header.
3. **Usage:** 6-cell context bar in brand, `81% ctx`, `12.4k tok` (this turn's tokens), the turn
   time, and `○ checking` (muted), `● online` (green), `● failed` (red) or
   `○ no provider` (muted). The selected provider is checked on startup and every 30 seconds after
   each completed check, with a three-second timeout and no credentials or prompt content sent.
   HTTP 2xx and most 4xx responses confirm reachability; redirects, HTTP 407, transport errors
   and 5xx responses show `failed`. Vertex AI uses the regional endpoint selected by
   `GOOGLE_CLOUD_LOCATION`, or the global endpoint when no region is set or in express mode.
   `GOOGLE_VERTEX_BASE_URL` and `GOOGLE_GEMINI_BASE_URL` override the respective defaults.
   A streaming answer confirms `online`, while a pending request error shows `failed`.
   The conversation receives the failure reason once per outage, never on every poll. Idle:
   `0% ctx · — tok · —`.

The turn time counts the whole turn, approvals included, on the same base as its tokens. A custom
`ui.statusLine` replaces zone 3. When `ui.showModelQuotaInFooter` is enabled for an OrganizaOne
model, its API-reported remaining 5-hour quota (`5h 58%`) sits next to the context indicator. Below
25%, it is explicit (`5h 24% remaining`). If the API also reports 20% or less remaining for the weekly
quota, an amber `! Weekly 16% remaining` follows it and the same threshold adds one warning to the
conversation for that weekly reset. Missing or invalid quota values are not rendered; the footer does
not derive a countdown from a reset timestamp.

Notices: short-lived ones (`ctrl+c`/`ctrl+d` again to exit, `esc` again to clear or rewind, paste
progress) take the **whole row** while they apply — cut short they lose their meaning. Lasting
states (vim mode, shell mode, startup progress, IDE connection) replace zone 1 only, so the other
zones stay visible.

## Layout tiers

`utils/layout-tier.ts` is the single width helper: `getLayoutTier(columns)`, `atLeast(tier, min)`
and `sideMargin(tier)`. Components read it through `hooks/use-layout-tier.ts`; `isNarrowWidth` is
`tier === 'minimal'`. Each band drops what the band above dropped.

| Tier      | Columns | Drops                                                                                                                                                             |
| --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `full`    | ≥ 120   | nothing                                                                                                                                                           |
| `medium`  | 100–119 | context bar; `ctrl+c quit` hint                                                                                                                                   |
| `compact` | 80–99   | footer git zone; active skill; memory bar; `@ files` hint; `reasoning high` becomes `high`; approval options stack vertically                                     |
| `minimal` | < 80    | logo becomes the wordmark; hints; memory row; reasoning; `summary`; tokens; inactive chip labels; `checking`/`online`/`failed`/`no provider` text (dot stays); side margin 1 |

Side margin is 2 columns, 1 under 80. Under 80 the header is three rows: wordmark and version,
notices (shortened to `↑ v… · /update` and `● MCP · /mcp`), and the path right-aligned. The path
never leaves; it only shortens from the start.

## Dialogs and selection

- **Agent sessions** (`agent-view/session-dashboard.ts`): `/agents` (alias
  `/sessions`) is a full-screen terminal controller view. Open it with the command
  or bare Left from an empty focused prompt.
  Left retains text editing when any input is present, including whitespace, and
  does not take navigation from menus, searches, attachments or dialogs. It groups
  top-level conversations by workspace and keeps task, status, age, and model in aligned
  columns. At 110 columns or more it shows selected details on the right;
  narrower terminals use Space to switch between list and details. The active
  terminal session has a filled marker. Theme colours come from the same
  dark/light tokens as Ink; labels follow the current language. Arrows navigate,
  `/` searches, Enter attaches, and Esc returns. The controller renders ANSI
  frames because it runs outside the worker's Ink tree while that worker is
  detached. It must keep every row within the terminal width and never route
  keyboard input to a detached worker.

- **Subagent dashboard** (`background-view/AgentDashboard.tsx`): `/tasks` uses the
  terminal's available width and height, including its outer layout containers.
  At 120 terminal columns, the roster and details appear side by side; narrower
  panels show the roster until Enter opens details. Left/Right and Tab switch
  Summary, Plan, Activity and Details without transferring focus from the roster.
  Only Enter enters details; Esc returns to the roster. The roster count stays
  pinned at its bottom. In details, arrows and paging scroll bounded content.
  The active tab has an accent background, section titles and the roster heading
  use bold accent, and a blank row separates tabs from content. The tabs and
  back-to-list shortcuts share the same accent. Approval review uses the original
  confirmation component in its own bounded panel and remains scoped to the exact
  request. Plans come only from the owning agent's explicit `report_progress`
  updates, independently of tool activity and task completion.
- **Provider model catalog** (`auth/ProviderSetupSteps.tsx`): the list uses the
  actual dialog budget after the frame, title, inputs, notices and controls.
  Short terminals reduce gaps and secondary help; model rows stay on one line.
  The visible range, total and continuation arrows show that more models are
  available. Once the list has focus, arrows scroll, PgUp/PgDn move by a page,
  Home/End reach the first/last model, Space toggles and Enter confirms.
  Search remains optional; shrinking the terminal keeps the focused model in
  view and retains checked models. A list already saved opens with every model
  the provider still serves checked, ready to toggle off; ids the provider no
  longer serves stay visible in the input.
- **One selection style everywhere** (`shared/BaseSelectionList.tsx`, `SuggestionsDisplay.tsx`,
  model and login lists): the selected item gets `❯` in brand and its text in bold primary; the rest
  are secondary with two spaces in place of the arrow. Numbers stay. The selected colour is
  **never** the frame's colour: on the amber approval box the highlight disappeared.
- **Approval-mode selection** (`ApprovalModeDialog.tsx`, `shared/SelectionDialog.tsx`):
  a content-sized panel below the conversation, at most 140 columns wide, with a neutral
  `rule` border and a brand-coloured title. From 120 terminal columns, the highlighted
  option's description appears beside the list; below that, it appears underneath.
  The actual current mode keeps its green check while navigation changes the help.
  Enter applies the highlighted mode; Tab opens the user/workspace scope list and
  returns without losing the highlighted mode. The footer shows the selection position.
  Short terminals scroll the options within the available height and reduce help and
  secondary chrome; workspace-precedence warnings retain priority.
- **Approval** (`messages/ToolConfirmationMessage.tsx`): box bordered in amber (`activity.execute`)
  with the diff, the question and the options — side by side from 100 columns, stacked below.
- **Border colour says what the box is:** brand when it asks for a choice (model, connect provider),
  `rule` for autocomplete suggestions (`/`, `@`), amber for approval, red for provider errors.
- **Model list** (`ModelDialog.tsx`): title bold primary, subtitle `the current one is marked` in
  muted, current model with a green dot. After a switch, the conversation logs
  `model switched to <model> · <size> ctx` and the footer names the new model. For the main
  model, an `Effort` row lists `default` and the tiers the highlighted model takes, the chosen one
  as `‹ tier ›` in bold brand, the rest secondary; ←/→ move along it and the choice applies with the
  switch (`↑↓ navigate · ←→ effort · enter select · esc close`). A tier the next model lacks shows
  as its nearest one. With an OrganizaOne connection (account login, API key or
  tunnel, using Anthropic or either OpenAI API), the footer adds
  `ctrl+e edit list`, which replaces the picker with the provider model catalog
  (`auth/ModelListEditDialog.tsx`): the list is fetched on open, ctrl+r fetches it
  again, and the save refuses to drop the model in use. Discovery uses the active
  connection; saving preserves its authentication, protocol and other providers.
  Tunnel endpoints and temporary keys are never saved by the editor.
- **Effort** (`EffortDialog.tsx`): `default` first (the model/provider decides, and the saved tier
  is cleared), then the model's tiers; it opens on the current one.
- **Slash categories** (`SlashCommandMenu.tsx`): bare `/` opens recent commands and
  seven context groups: sessions, model/execution, project/context, agents/tasks,
  plugins/integrations, settings, and help/diagnostics. Enter or Tab opens a group
  in the content-sized selection panel, replacing the prompt. Esc returns to the
  same group cursor; Esc again dismisses the menu. The root footer shows the
  selected position out of eight, including when short terminals scroll the list.
  Groups include only loaded,
  visible, user-invocable interactive commands. Plugin, skill, custom, workflow,
  and MCP commands stay in integrations, with their source metadata retained.
  Recent commands reflect session usage and omit commands no longer available.
  Categories have an inline filter matching canonical names, aliases, readable
  labels, and descriptions, ignoring case and accents. Name and label matches
  precede description-only matches. Letters and digits filter;
  arrow keys navigate and mouse hover/click keeps the same selection behavior.
  Commands with available subcommands open another panel with their canonical
  path in the title; Esc restores the parent's filter and cursor. Hidden or
  unavailable descendants never appear. A parent's own action remains a separate
  selectable item alongside its subcommands. Selecting a nested leaf returns its full
  path to the prompt when its input contract is unspecified, so arguments can be
  supplied before execution; explicit no-input leaves keep immediate execution.
  Typing a command name or arguments after `/` keeps direct autocomplete.
  When direct autocomplete has no results, natural-language queries search the
  same labels and descriptions across available commands and descendants.
- **Settings** (`SettingsDialog.tsx`): interactive `/config` and `/settings` open
  the same panel, using the terminal width with two-column outer margins on each
  side and the layout's whole dialog-height reservation, so Settings, Status and
  Stats keep one size while switching tabs. The settings list fills the rows it
  has and the footer stays at the bottom. In full-screen mode the conversation
  frame is hidden while the panel is open and returns when it closes.
  The tab bar shows where the focus is: while it has focus, a brand `❯` leads
  it, the active tab is a filled brand chip and the other tabs and the hint turn
  brighter; otherwise the active tab is only named in accent bold and the hint
  dims. The `❯` column is always reserved, so the bar never shifts.
  The search is an input like the composer's: a frame in `rule`, `brand` with a
  cursor while it has focus, `⌕` and the placeholder colour while empty (panels
  under 14 rows drop the frame). After one blank row, the scope reads
  `Scope:  ● User  ○ Workspace` in its own colours, so it does not look like a
  setting: brand soft for User, amber for Workspace (project settings override
  the user's), with `· this project only` while Workspace is active. Tab switches it in place: the list stays, its values
  follow the new scope, and the cursor stays on the same setting (or the nearest
  row when the Workspace list leaves it out). There is no separate scope screen,
  and Tab waits while a value is being edited. The footer shows the selected
  position. At 120 columns and sufficient height, the selected setting's
  canonical key and description appear on the right; narrower terminals keep
  the description below the list. The help column takes its height from the
  visible list and search area; long descriptions end with an ellipsis instead
  of expanding the panel or hiding its footer. Values truncate within their column;
  while editing, the visible text follows the cursor and marks hidden content
  with an ellipsis.
  Search, scope selection, edits, resets, and persistence retain their existing
  behavior. `/config` arguments and non-interactive listing remain available.
  The Portuguese locale covers every visible setting label, description, and
  enum option, as well as tab hints, inherited-scope notices, and boolean display
  values. Canonical keys, commands, persisted values, and modification markers
  remain unchanged. `settings-translations.test.ts` guards this coverage.
- **Plugin configuration** (`extensions/ExtensionsManagerDialog.tsx`):
  `/extensions`, `/plugins` and `/plugin` open the same manager, capped at its
  existing 100-column frame. In full-screen mode the conversation frame is hidden
  while the manager is open and returns when it closes. Tabs stay on one row;
  narrow layouts omit the switch hint and extra margins before truncating labels.
  The parent uses the layout's
  actual dialog-height reservation and subtracts borders, tabs, footer, status
  and gaps before passing an inner budget to the editors. Short panels reduce
  gaps and keep footer/status text on one row.
  Declared plugin parameters use an embedded selection panel, with `Tab` switching
  User/Project scope outside the input. Project values inherit User settings
  unless overridden; parameter and activation scopes remain independent. Saved secrets
  become configured metadata before entering view state. Replacement starts empty,
  stays masked and blocks the external editor. Empty secret submission preserves
  the saved value; cancellation never writes. Successful edits require a restart.
  Marketplace **Edit source** stays separate from **Update marketplace**. Private
  URLs are redacted and must be re-entered; credential/query/fragment input stays
  masked. Both editors reserve prefix/cursor space and show up to three visible
  input lines with continuation. Secondary help/header rows shrink to preserve
  save/cancel controls. Source details limit installed previews to retain actions,
  including Edit/Remove after a failed fetch; unconstrained details retain their
  existing five-entry preview. Pending edits retain keyboard ownership through
  persistence and detail refresh, and obsolete responses cannot replace a newer
  selection.
  Real application captures: [plugin settings](../images/tui-plugin-settings.png)
  and [private marketplace editing](../images/tui-marketplace-source-edit.png).
- **Slash/@ suggestions:** name in a 28-column column, detail in muted, footer
  `↑↓ navigate · tab complete · enter select · esc close`. Lists filter on every key.
- **Plugin choices** (`components/PluginChoicePrompt.tsx`): the dialog receives its available
  row budget from its caller. The visible names and selected description share that budget;
  PgUp/PgDn scroll the complete description while arrows select another plugin. Short terminals
  compact the title, spacing and frame before losing access to content or selection controls.
- **Long composer input:** the editable viewport uses at most six rows and shrinks with the
  terminal height, reserving the pinned header, transcript frame and composer controls.
  Resizing scrolls the visible text without discarding the complete input.
- **Windows symbol widths:** plain status symbols omit variation selectors because ConPTY
  advances extra columns for those sequences. Symbols with an emoji presentation retain their
  text selector; macOS and Linux retain the selectors used for narrow rendering in CJK terminals.
- **Question custom answers** (`messages/AskUserQuestionDialog.tsx`): questions, option
  lists and answer reviews use their natural measured height when they fit, keeping
  choices and navigation together inside their own amber confirmation frame beside
  the conversation context. Below ten available rows the controls take priority over
  the frame. The available
  message height is a ceiling, not a reserved panel height. Questions, option
  descriptions and answer reviews scroll with PgUp/PgDn within the available message height.
  The question header, active choice or custom input, and navigation remain pinned when space
  permits. Nested question content receives scrolling first while it can move in the requested
  direction; at its boundary, scrolling continues through the conversation so earlier context
  remains accessible. Pending question rows retain their drafts and selections when scrolled out
  of view, without keeping the full transcript mounted. Scroll shortcuts do not select another
  answer. An arriving question brings the transcript to its latest turn, including when the user
  was reading earlier messages. Full-detail
  mode expands results but retains the height budget
  for direct and subagent questions. The input
  uses the available message width after padding, numbering, and the input
  prefix. Up to three wrapped lines stay visible when space permits; longer answers show the
  visible line range and arrows for hidden text. Enter submits the complete
  answer once; wrapping and scrolling never discard its contents.
- **Exit summary** (`QuittingDisplay.tsx`): default five-second countdown, with
  a connection-type row in the statistics identifying the active API protocol,
  recognized provider, and authentication by API key, browser account login,
  o1-gateway/o1-connect, or application default credentials.
  Esc and Ctrl+C exit immediately without saving pending preferences; their hint
  remains visible during the countdown and when paused. Footer hints and errors
  align with the checkbox column, with one blank line after the choices.
  Other non-paste keys
  pause it for the current exit. Keep-open and hide choices
  are exclusive; arrows/Tab choose, Space or a click toggles, and Enter confirms
  and saves both User preferences together before exiting. The first Enter
  during the countdown only pauses it. Configuration exposes summary visibility,
  permanent keep-open behavior, and a positive timeout in seconds.
- **Connect provider** (`auth/AuthDialog.tsx`, `ProviderSetupSteps.tsx`): brand-bordered box, the path
  walked so far in muted, `step N of M` on the right (`step N` when the total is not known yet). The
  first screen has four two-line entries (OrganizaOne, API key, Local, Custom); the API key list is
  one line per provider, the label in an 18-column column and the description muted. A badge
  follows the label on the same line: `coming soon` in warning for an entry not available yet (drawn
  muted, still reachable so enter can say why), `● … detected` in success for a local server that
  answered, `○ not running` and `… looking` in muted. The key is masked in the middle
  (`auth/mask-key.ts`: 8 head, 4 tail) and checked; `✓ key valid` on success. Before pasting:
  `the key is saved in ~/.o1-code/credentials/, for your user only`. The review is one line each for
  Provider, Endpoint, Key and Models plus one muted line on where they are saved, so it fits 40 rows;
  the settings JSON is not shown.
- **Display-mode step** (`auth/DisplayModeStep.tsx`): after a successful connection, as long as
  `ui.displayMode` is not saved in the User scope, the dialog ends on one more step (`› display`,
  `step N of N`): `✓ Account connected.`, the question, Detailed (preselected, `as today`) and
  Summary with one line each, and from 100 columns a preview of the highlighted mode built from the
  same row components. Enter saves the mode for the user and applies it; Esc closes without saving,
  so the step returns on the next connection.
- **Start screen** (`components/WelcomeScreen.tsx`, hidden by `ui.hideTips`): welcome line, one
  sentence on what the agent does, `GETTING STARTED` and `RECENT SESSIONS` (up to three, then
  `/resume to continue a session`). Section titles use brand colour, bold, upper case;
  session names use primary text and their ages stay muted. Commands, including `/resume`,
  use accent colour and bold; files use the code colour.

## Glyphs and the compatible mode

All chrome glyphs come from `glyphs()` in `glyphs.ts`. The Windows console host with Consolas or
Lucida Console lacks many of them, so a compat set replaces them with glyphs from WGL4:

| Full              | Compat                               |
| ----------------- | ------------------------------------ |
| `❯`               | `>`                                  |
| `⎇ ` (with space) | removed; the purple marks the branch |
| `▰` `▱`           | `█` `░`                              |
| `↳`               | `→`                                  |
| `✗`               | `x`                                  |
| `!` (warning)     | `!`                                  |
| `✓`               | `√`                                  |
| `◆` (assistant)   | `*`                                  |
| braille spinner   | `\|` `/` `-` `\`                     |
| round border      | single border                        |

`●`, `○`, `↑` are the same in both. A glyph goes into the set only when a component reads it.

**Activation:** setting `ui.glyphs` (`auto`, default; `full`; `compat`). `auto` picks compat on
Windows when neither `WT_SESSION` nor `TERM_PROGRAM` is set — the console host sets neither;
Windows Terminal, VS Code and others do. Resolved once at startup (`llm.tsx`), restart required.

**Ambiguous-width rule** (also in `STACK-O1-CODE.md`): no East Asian Ambiguous glyph (`△`, `⚠`, `✔`,
…) in a row that can reach the full terminal width, even with VS15. Windows Terminal draws some of
them two columns wide, the row wraps where Ink counts one, and every later repaint is off by a line.
Use ASCII or a glyph from `glyphs()`. On macOS and Linux, the ambiguous glyphs the sets keep carry
VS15 so CJK terminals draw them one column wide, as Ink measures them. On Windows, plain symbols
omit that selector: ConPTY can advance an extra column for these sequences, wrapping a footer and
displacing the frame. Keep the text selector for symbols with an emoji presentation, including
`ICON.CROSS` and `ICON.SPARKLE`; the plain-symbol exception does not replace the rule below.

**Emoji-presentation rule:** on Windows, a symbol that has both a text and an emoji presentation
(`ℹ`, `▶`, `☑`, `⚠`, `✔`, `✖`) in tool output and code blocks gets the text-presentation selector
U+FE0E appended (`ui/utils/text-presentation.ts`), unless a variation selector already follows.
Windows Terminal draws such a symbol two cells wide while advancing the cursor one, so it hides the
space that follows. `✅` and `❌` have no text presentation, so the selector would not change them;
`❯`, `✓` and `➜` have no emoji presentation. All of those are left alone.

## Text

- **Tone:** direct, no enthusiasm, no emoji. Short sentences in the present tense that say what is
  happening or what the user can do. No apologies, no exclamation marks.
- **Locale:** the product follows the user's locale. Every new interface string is an English key
  in `i18n/locales/en.js` with a hand-reviewed pt-BR translation in `pt.js`; other locales fall back
  to the English key.
- Names shown to the user come from `brand.json` (through `generated/brand.ts`), never from a
  literal. `node scripts/o1/brand-lint.mjs` is the gate.

## Layout regression checks

After building and bundling, run the real CLI against a local fake provider with:

```bash
node --import tsx integration-tests/terminal-capture/terminal-layout-regression.ts feedback
node --import tsx integration-tests/terminal-capture/terminal-layout-regression.ts question
node --import tsx integration-tests/terminal-capture/terminal-layout-regression.ts resize
node --import tsx integration-tests/terminal-capture/subagent-dashboard-regression.ts
```

These checks require the installed Playwright Chromium browser. They use temporary settings and
six conversation turns, assert the visible terminal contents, and save screenshots and raw output.
The question scenario pages down and back up, sends mouse-wheel events, and toggles full-detail
mode. `O1CODE_TUI_E2E_OUT` selects the capture directory. Renderer composition, dialog row budgets,
custom answers and plugin navigation also have collocated CLI tests. The resize scenario shrinks
from 100×30 to 80×24 and 60×18, restores 100×30, and verifies that the complete original input is
submitted. Verify border positions and controls as well as marker text: a frame can contain all
expected words while still being misaligned.

The subagent scenario uses two real background agents against the local provider,
records their explicit progress, switches tabs and agents, enters and leaves
details, and resizes between 120×40 and 70×24. It checks filled tab styling,
shortcut colours, roster counts, tab spacing and complete frame edges. Its evidence
defaults to ignored `ops/subagent-dashboard/terminal`; captures are not repository
assets.

These captures render through xterm.js. They do not establish how a Windows terminal draws a glyph.
Use the native execution and evidence procedure in [Windows validation](WINDOWS-VALIDATION.md)
when changing Windows rendering, shells or process handling.

## See also

- `STACK-O1-CODE.md` — Windows rules, including the ambiguous-width rule.
- `WINDOWS-VALIDATION.md` — native test setup, scenario matrix and evidence requirements.
- `../../README.md` (Principles) and `../../ROADMAP.md` — what the product is and what comes next.
