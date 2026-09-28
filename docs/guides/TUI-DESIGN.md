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
- The theme never paints a background. Everything draws on the terminal's own background.
- Colours come from theme tokens, never from literals in a component.

## Colour

Two themes with the same roles: `themes/o1-code-dark.ts` (the default) and
`themes/o1-code-light.ts`. The light one applies when the user picks it, or picks `auto` and the
terminal reports a light background. `themes/o1-code-palette.test.ts` pins the values and checks
every light-theme text colour at 4.5:1 or more on `#f7f9fc`.

Roles live in two places: `SemanticColors` (`theme.*`, `themes/semantic-tokens.ts`) and
`ExtendedColors` (`extendedTheme.*`, `themes/extended-tokens.ts`) for the roles the inherited set did
not have. Themes that do not declare extended colours get them derived from their palette.

| Role                   | Token                                       | Dark      | Light     | Used for                                                          |
| ---------------------- | ------------------------------------------- | --------- | --------- | ----------------------------------------------------------------- |
| primary text           | `theme.text.primary`                        | terminal  | `#162033` | main text, selected item, titles                                  |
| secondary text         | `theme.text.secondary`                      | `#95a5be` | `#46546d` | unselected items, queued messages                                 |
| muted                  | `extendedTheme.text.muted`                  | `#8593aa` | `#56637b` | labels, hints, metadata                                           |
| placeholder            | `extendedTheme.text.placeholder`            | `#7a879e` | `#65728a` | input placeholder                                                 |
| separator              | `extendedTheme.ui.separator`                | `#3a4258` | `#b4bfd0` | `·` and `│`, empty bar cells, inactive chips                      |
| rule                   | `extendedTheme.ui.rule`, `theme.border.default` | `#2a3550` | `#cfd7e4` | conversation border, autocomplete box, unfocused input        |
| brand                  | `extendedTheme.ui.brand`, `theme.border.focused` | `#6e9bff` | `#2b5bd7` | logo, `❯`, selection arrow, focused input, dialogs asking a choice |
| brand soft             | `extendedTheme.ui.brandSoft`                | `#8fb2ff` | `#2f5fdb` | default/auto mode label, active skill, update notice, user message text, `monitoring` chip |
| accent (purple)        | `theme.text.accent`                         | `#a48bff` | `#6547c9` | branch, memory bar, assistant `◆`, `@path` and `/command` in input |
| code (teal)            | `theme.text.code`                           | `#3fc7d6` | `#0a6d78` | inline code and paths                                             |
| success                | `theme.status.success`                      | `#3fd07f` | `#157a44` | online, added lines, current model dot                            |
| warning (amber)        | `theme.status.warning`                      | `#ffa347` | `#9a5200` | MCP offline, Safe/Debug Mode, warnings                            |
| error                  | `theme.status.error`                        | `#ff6b6b` | `#c02d2d` | failure, removed lines, provider error                            |

**Why the dark theme's primary text is empty (the terminal's foreground):** without `ui.theme`,
background detection falls back to the dark theme when it fails. An explicit near-white would be
unreadable on a light terminal. `#e6ecf5` is the design reference, not a painted value.

With 256 or 16 colours, chalk (under Ink) reduces each token to the nearest ANSI colour. The product
has no colour detection of its own and nothing is designed for 16 colours on purpose.

### Activity categories

Every tool belongs to a category (`utils/activity-category.ts`, from the tool's `Kind` in core). The
same colour and label appear on the tool row and on the activity-line chip.

| Category  | Colour token                | Kinds                    | en / pt label          |
| --------- | --------------------------- | ------------------------ | ---------------------- |
| `info`    | `activity.info` (brand)     | thinking, answering, other | info / info          |
| `read`    | `activity.read` (teal)      | Read, Search, Fetch      | reading / leitura      |
| `write`   | `activity.write` (purple)   | Edit, Delete, Move       | writing / escrita      |
| `execute` | `activity.execute` (amber)  | Execute                  | running / executando   |
| `success` | `activity.success` (green)  | explicit completion      | done / sucesso         |

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
   thinking line; at the bottom, the queue.
3. **Activity line** (`components/ActivityLine.tsx`), right above the input.
4. **Input** (`components/InputPrompt.tsx`, `BaseTextInput.tsx`).
5. **Footer** (`components/Footer.tsx`, `footer-zones.tsx`).

While a tool waits for approval, or a dialog is open, the input, activity line and footer are not
rendered; the approval box or dialog takes their place. In scrollback mode and screen-reader mode
the header is not pinned, and the update notice renders as its own box above the input.

### Header

Each row has an independent left and right side: a long item on the right never squeezes the left.

| Row | Left                         | Right                                                            |
| --- | ---------------------------- | ---------------------------------------------------------------- |
| 1   | logo, row 1                  | `v0.1.0 · ORGANIZAONE`, bold, muted (from `brand.json` and `package.json`) |
| 2   | logo, row 2                  | `memory 6.2 / 16 GB` and an 8-cell purple bar (machine RAM)       |
| 3   | empty                        | notices, only when present: `↑ v… available · /update` (brand soft), `● N MCP offline · /mcp` (amber) |
| 4   | shortcut hints               | workspace path: parents muted, folder bold primary               |

Hints: `esc cancel · shift+tab mode · / commands · @ files · ctrl+c quit`, key in secondary, label
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
  active workflow.

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
- **Session name:** set into the top border on the right (`/rename`); the rule before it takes only
  the room the name leaves, so the border keeps the input's width.
- **End-of-line cursor:** a styled space and nothing after it. A zero-width space used to follow
  it: Ink counts U+200B as one column and VTE (GNOME Terminal, Ptyxis) as none, which pulled the
  right border in by one column.
- **Selecting text:** with mouse tracking on, a drag over the typed text selects it like the
  conversation does (same highlight, copied on release); a click without a drag places the cursor,
  on release, so it never repaints a selection being made.
- **Multiline:** grows up to 6 visible lines (`INPUT_MAX_VISIBLE_LINES`). With more than one line,
  `N lines · enter sends · shift+enter new line` shows on the right; scrolled, the first visible row
  is `↑ N lines above`.

### Footer

Three zones spread across the width (`footer-zones.tsx`):

1. **Mode:** `● AUTO` bold — brand soft for default and auto, amber for edits, red for YOLO, green
   for plan — then `│`, the model name alone (no provider; `—` without one), `· reasoning high`, and
   `Safe Mode` / `Debug Mode` when on.
2. **Git:** `⎇ main` in accent, `+31` green `-6` red: the working-tree diff. A worktree shows its
   own branch. The folder is not repeated here; it is in the header.
3. **Usage:** 6-cell context bar in brand, `81% ctx`, `12.4k tok` (this turn's tokens), the turn
   time, and `● online` (green), `● failed` (red) or `○ no provider` (muted). "Online" means the last
   request succeeded. Idle: `0% ctx · — tok · —`.

The turn time counts the whole turn, approvals included, on the same base as its tokens. A custom
`ui.statusLine` replaces zone 3.

Notices: short-lived ones (`ctrl+c`/`ctrl+d` again to exit, `esc` again to clear or rewind, paste
progress) take the **whole row** while they apply — cut short they lose their meaning. Lasting
states (vim mode, shell mode, startup progress, IDE connection) replace zone 1 only, so the other
zones stay visible.

## Layout tiers

`utils/layout-tier.ts` is the single width helper: `getLayoutTier(columns)`, `atLeast(tier, min)`
and `sideMargin(tier)`. Components read it through `hooks/use-layout-tier.ts`; `isNarrowWidth` is
`tier === 'minimal'`. Each band drops what the band above dropped.

| Tier      | Columns | Drops                                                                                                          |
| --------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `full`    | ≥ 120   | nothing                                                                                                        |
| `medium`  | 100–119 | context bar; `ctrl+c quit` hint                                                                                |
| `compact` | 80–99   | footer git zone; active skill; memory bar; `@ files` hint; `reasoning high` becomes `high`; approval options stack vertically |
| `minimal` | < 80    | logo becomes the wordmark; hints; memory row; reasoning; tokens; inactive chip labels; `online`/`failed`/`no provider` text (dot stays); side margin 1 |

Side margin is 2 columns, 1 under 80. Under 80 the header is three rows: wordmark and version,
notices (shortened to `↑ v… · /update` and `● MCP · /mcp`), and the path right-aligned. The path
never leaves; it only shortens from the start.

## Dialogs and selection

- **One selection style everywhere** (`shared/BaseSelectionList.tsx`, `SuggestionsDisplay.tsx`,
  model and login lists): the selected item gets `❯` in brand and its text in bold primary; the rest
  are secondary with two spaces in place of the arrow. Numbers stay. The selected colour is
  **never** the frame's colour: on the amber approval box the highlight disappeared.
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
  as its nearest one.
- **Effort** (`EffortDialog.tsx`): `default` first (the model/provider decides, and the saved tier
  is cleared), then the model's tiers; it opens on the current one.
- **Slash/@ suggestions:** name in a 28-column column, detail in muted, footer
  `↑↓ navigate · tab complete · enter select · esc close`. Lists filter on every key.
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
- **Start screen** (`components/WelcomeScreen.tsx`, hidden by `ui.hideTips`): welcome line, one
  sentence on what the agent does, `GETTING STARTED` and `RECENT SESSIONS` (up to three, then
  `/resume to continue a session`). Section titles muted, bold, upper case; commands and files in
  teal.

## Glyphs and the compatible mode

All chrome glyphs come from `glyphs()` in `glyphs.ts`. The Windows console host with Consolas or
Lucida Console lacks many of them, so a compat set replaces them with glyphs from WGL4:

| Full                | Compat                             |
| ------------------- | ---------------------------------- |
| `❯`                 | `>`                                |
| `⎇ ` (with space)   | removed; the purple marks the branch |
| `▰` `▱`             | `█` `░`                            |
| `↳`                 | `→`                                |
| `✗`                 | `x`                                |
| `✓`                 | `√`                                |
| `◆` (assistant)     | `*`                                |
| braille spinner     | `\|` `/` `-` `\`                   |
| round border        | single border                      |

`●`, `○`, `↑` are the same in both. A glyph goes into the set only when a component reads it.

**Activation:** setting `ui.glyphs` (`auto`, default; `full`; `compat`). `auto` picks compat on
Windows when neither `WT_SESSION` nor `TERM_PROGRAM` is set — the console host sets neither;
Windows Terminal, VS Code and others do. Resolved once at startup (`llm.tsx`), restart required.

**Ambiguous-width rule** (also in `STACK-O1-CODE.md`): no East Asian Ambiguous glyph (`△`, `⚠`, `✔`,
…) in a row that can reach the full terminal width, even with VS15. Windows Terminal draws some of
them two columns wide, the row wraps where Ink counts one, and every later repaint is off by a line.
Use ASCII or a glyph from `glyphs()`. The ambiguous glyphs the sets keep carry VS15 so CJK terminals
draw them one column wide, as Ink measures them.

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

## See also

- `STACK-O1-CODE.md` — Windows rules, including the ambiguous-width rule.
- `../../README.md` (Principles) and `../../ROADMAP.md` — what the product is and what comes next.
