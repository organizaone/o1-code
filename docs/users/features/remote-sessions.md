# Remote sessions (`/rc`)

A terminal running O1-Code can put its session in **remote mode**: the OrganizaOne gateway
mirrors what the terminal shows to your account page — on a phone, a tablet, another computer —
and hands back what you type there, the commands you run and the answers you give to the
terminal's questions. The terminal keeps running on its machine and stays the only executor; the
gateway is a relay that keeps none of the session's content.

Remote mode is for people signed in with an OrganizaOne account whose plan includes remote
sessions. It is a channel of the gateway, not an app: nothing runs in the browser but the viewer.

## Turning it on

1. Connect with the OrganizaOne account provider (`/auth` → "Sign in with your account", or the
   o1-gateway device code).
2. Type `/rc`. The first time, a notice says what is mirrored and what the gateway keeps; Enter
   accepts it once.
3. The dialog shows the viewer's address under your account page and a QR code. Open it signed
   in with the same account: **Remote sessions** lists the terminal, and the session view says
   "Connected to the terminal" with the recent conversation.

The footer shows `remote: active · 1 viewer` while a browser is attached, `remote: reconnecting`
while the gateway is away, and `remote: ended: <reason>` when the gateway ended the session.

| Command           | What it does                                                                    |
| ----------------- | ------------------------------------------------------------------------------- |
| `/rc`             | Puts the session in remote mode and shows the address and the QR code again.    |
| `/rc off`         | Leaves remote mode; the gateway ends the session at once and tells the viewers. |
| `/rc status`      | The state, the session's name and the address.                                  |
| `/rc name <name>` | Renames the session (the same address: a new hello under the new name).         |

`o1-code --rc [name]` starts a session in remote mode; `remote.atStartup: true` does it for every
interactive session.

## What travels, and what does not

From the terminal to the viewer: the conversation as it is shown (your prompts, the model's
replies, each tool call and its result), what the terminal is doing (idle, streaming, waiting for
an answer), and every question it asks — a tool's permission, an `AskUserQuestion`, a plan to
approve.

From the viewer to the terminal: prompts, which enter the terminal's queue as if typed there and
appear in the transcript marked `[from the account page]`; the commands **stop turn**, **compact**,
**clear**, **model** and **effort**; and answers to the open questions. The **first answer wins**:
when you answer in the terminal, the card closes on the page; when you answer on the page, the
terminal applies it and says who answered. A question that is still open after an hour expires.

Never remote: `/resume`, the `!` shell, `/plugin`, file access, and the approval mode itself — a
viewer answers questions, it does not change the policy. A multi-question `AskUserQuestion` stays in
the terminal.

The gateway keeps a row per session (owner, device, name, when) and an audit entry per viewer and
per decision (its id, kind, outcome and who answered). It never stores the content: the terminal's
own transcript is the record.

## Reaching the gateway

| `remote.viaTunnel` | How the terminal connects                                                           |
| ------------------ | ----------------------------------------------------------------------------------- |
| `auto` (default)   | Through the o1-connect tunnel when the model goes through one; directly otherwise.  |
| `always`           | Only through the tunnel — what a filtered network needs; `/rc` refuses without one. |
| `never`            | Directly, with the account's device key.                                            |

The direct connection uses the device key the sign-in saved; through the tunnel the WebSocket rides
the pinned TLS of the o1-connect connection, so a network that passes the tunnel passes remote
mode.

## When it will not start

- _Remote needs the OrganizaOne sign-in_: the model does not go through OrganizaOne with the
  account's key.
- _Your plan does not include remote sessions_: the plan, or the installation's switch
  (Settings › Advanced › Remote sessions on the gateway), does not allow it.
- _Your plan allows no more remote sessions at once_: the live sessions are named; end one on the
  account page or with `/rc off` in its terminal.
- _The gateway refused the remote session (`<code>`)_: the gateway's answer, verbatim.

## Dropping and ending

If the terminal loses the gateway (a closed lid, a network change), the library reconnects on its
own with a backoff of 1 to 30 seconds and resends what the gateway had not acknowledged; the page
says "waiting for the terminal" meanwhile. A terminal gone for two minutes ends the session on the
gateway's side; the same session id re-opens the same address for four hours.

A session ends when the terminal leaves (`/rc off`, quitting), when it is ended from the account
page (a step-up is asked there), when the device is removed or suspended, when the plan or the
installation no longer allows it, or when a second terminal with the same session id takes it over.
The terminal says why and leaves remote mode.

## Settings

| Setting            | Values                        | Default | Notes                                                                               |
| ------------------ | ----------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `remote.enabled`   | boolean                       | `true`  | Offers `/rc`. User, System and SystemDefaults scopes only. Requires a restart.      |
| `remote.atStartup` | boolean                       | `false` | Starts remote mode with every interactive session. Same scopes. Requires a restart. |
| `remote.viaTunnel` | `auto` \| `always` \| `never` | `auto`  | See above.                                                                          |
| `remote.consented` | boolean                       | `false` | Set by the first `/rc` once the notice is accepted.                                 |

`O1CODE_DISABLE_REMOTE=1` turns remote sessions off whatever the settings say; a project `.env`
cannot set it.

`o1-code sessions ps` shows a REMOTE column with how long each session has been in remote mode.
