# Contextual Tips

O1-Code includes a contextual tips system that helps you discover features and stay aware of session state.

## Start Screen

The old per-launch startup tip has been replaced by a start screen shown at
the top of an empty conversation. It welcomes you, gives a few
getting-started pointers (mentioning files with `@`, using `/` commands,
creating an `AGENTS.md` with `/init`), and — when the project has other
recent sessions — lists up to three of them with `/resume` to continue one.
It disappears once you send your first message and does not reappear later
in the same session.

## Post-Response Tips

During a conversation, O1-Code monitors your context window usage and shows tips when action may be needed:

| Context usage | Condition                      | Tip                                               |
| ------------- | ------------------------------ | ------------------------------------------------- |
| 50-80%        | After a few prompts in session | Suggests `/compress` to free up context           |
| 80-95%        | —                              | Warns context is getting full                     |
| >= 95%        | —                              | Urgent: run `/compress` now or `/new` to continue |

Post-response tips have per-tip cooldowns to avoid being repetitive.

## Tip History

Tip display history is persisted at `~/.o1-code/tip_history.json`. This file tracks:

- Session count (incremented on every launch)
- Which tips have been shown and when (used for post-response tip cooldown and cross-session rotation)

You can safely delete this file to reset tip history.

## Disabling Tips

To hide the start screen and post-response tips, set `ui.hideTips` to `true` in `~/.o1-code/settings.json`:

```json
{
  "ui": {
    "hideTips": true
  }
}
```

You can also toggle this in the settings dialog via the `/settings` command.

Tips are also automatically hidden when screen reader mode is enabled.
