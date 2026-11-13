# Product telemetry

O1-Code sends two kinds of anonymous data to the OrganizaOne intake: daily **usage metrics** and
**error reports** of its own crashes. What users are told is in
[Terms of Service and Privacy Notice](../users/support/tos-privacy.md#usage-metrics-and-error-reports);
this page is the contract between the client and the intake.

The client is `packages/core/src/telemetry/product/`. OpenTelemetry (`packages/core/src/telemetry/`)
is a separate, opt-in export to the user's own collector and is not involved.

## Switches

| Data          | Setting                          | Variable                          | Default |
| :------------ | :------------------------------- | :-------------------------------- | :------ |
| Usage metrics | `privacy.usageStatisticsEnabled` | `O1CODE_USAGE_STATISTICS_ENABLED` | on      |
| Error reports | `privacy.errorReportsEnabled`    | `O1CODE_ERROR_REPORTS_ENABLED`    | on      |
| Both          |                                  | `DO_NOT_TRACK` (not empty, not 0) | —       |

`O1CODE_TELEMETRY_URL` replaces the intake base URL (default
`https://api.organizaone.com/telemetry/v1`), for tests or a self-hosted intake.

## How the client sends

- Usage metrics identify the installation by the random UUID in `~/.o1-code/installation_id`,
  nothing else. Error reports carry no identifier at all, and with usage metrics off the ID file is
  neither read nor created for them.
- Each process counts its usage per **local** day and writes it to
  `~/.o1-code/telemetry/usage/<day>.<process>.json`; the sender sums the files of a day.
- A terminal or headless run counts one session when it starts. A process that hosts sessions over
  ACP (an editor, or a child of `o1-code serve`) counts each session as `sdk` at its first prompt,
  since such a host opens sessions, and configurations that hold no conversation, before anyone
  uses them. The `serve` daemon itself counts nothing and records no crash of its own; its children
  do both.
- Ten seconds after startup and then every 15 minutes, a session sends. Usage goes at most once an
  hour per installation (`~/.o1-code/telemetry/state.json`), with every day of the last 31 that has
  data, today's partial totals included. Once accepted, the files of finished days are deleted; a
  failure keeps everything for the next attempt.
- An uncaught exception or unhandled rejection is sanitized and stored synchronously in
  `~/.o1-code/telemetry/errors/`, grouped by fingerprint and version, and sent with the next attempt
  (at most 20 groups per request).
- Requests time out after 5 seconds and never block the session.
- When the session's model rides the o1-connect tunnel, a request goes through it first
  (`<tunnel>/telemetry/v1/<route>`), and directly to the intake only if the tunnel does not take
  it. The tunnel adds the device's token to every request; the intake ignores it and neither
  stores nor logs it, so a report stays as anonymous as one sent directly.
- A direct request whose TLS chain ends in a CA that Node does not ship is retried once with the
  operating system's CAs as well.
- A body the intake refuses (`400`, `413`) is not sent again; the refusal is written to the debug
  log.
- A process that ends within ten seconds sends nothing itself; its counts go with the next session.
- Turning a switch off deletes what was waiting for that switch.

## Intake contract (schema 1)

Both routes take `Content-Type: application/json`, need no authentication, and answer `204` on
success. A body that does not match exactly, an unknown field at any level included, is refused with `400`
and is not partially stored.

### `POST /telemetry/v1/usage`

```json
{
  "schema": 1,
  "installationId": "3f1c…-uuid",
  "client": {
    "version": "0.24.0",
    "os": "win32",
    "arch": "x64",
    "node": "22",
    "install": "npm",
    "locale": "pt-BR"
  },
  "days": [
    {
      "day": "2026-11-09",
      "sessions": { "interactive": 2, "headless": 1, "sdk": 0 },
      "prompts": 14,
      "toolCalls": {
        "read_file": 30,
        "run_shell_command": 12,
        "mcp": 4,
        "other": 1
      },
      "slashCommands": { "model": 1, "custom": 2 },
      "providers": { "organizaone": 20, "openai": 3 },
      "apiErrors": { "http_429": 1 },
      "tokens": { "input": 120345, "output": 8456 },
      "subagents": 2
    }
  ]
}
```

| Field            | Rule                                                                                                        |
| :--------------- | :---------------------------------------------------------------------------------------------------------- |
| `schema`         | `1`                                                                                                         |
| `installationId` | a UUID                                                                                                      |
| `client.version` | up to 32 characters of `[0-9A-Za-z.+-]`, or `unknown`                                                       |
| `client.os`      | `win32`, `darwin`, `linux`, `other`                                                                         |
| `client.arch`    | `x64`, `arm64`, `other`                                                                                     |
| `client.node`    | 1 to 3 digits, or `unknown`                                                                                 |
| `client.install` | `^[a-z][a-z0-9_.:-]{0,63}$` (`npm`, `standalone`, `homebrew`, `npx`, `unknown`, …)                          |
| `client.locale`  | `^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$` or `other`                                                            |
| `days`           | 0 to 31 entries, distinct `day` values                                                                      |
| `day`            | `YYYY-MM-DD`, not older than 400 days and not more than one day after the intake's UTC date                 |
| day entry        | every field of the example, nothing else                                                                    |
| `sessions`       | exactly `interactive`, `headless`, `sdk`, each present                                                      |
| `tokens`         | exactly `input`, `output`                                                                                   |
| map fields       | `toolCalls`, `slashCommands`, `providers`, `apiErrors`: up to 101 keys of `^[A-Za-z][A-Za-z0-9_.:-]{0,63}$` |
| every count      | an integer from 0 to 1,000,000,000                                                                          |

The intake records the installation as active on its own UTC date of receipt, even with an empty
`days`. A `day` already stored for the installation is **replaced**, not added to: the client sends
cumulative totals, so a repeated or partial day converges to the final one.

### `POST /telemetry/v1/errors`

```json
{
  "schema": 1,
  "client": {
    "version": "0.24.0",
    "os": "linux",
    "arch": "x64",
    "node": "22",
    "install": "npm",
    "locale": "en-US"
  },
  "errors": [
    {
      "fingerprint": "9b2f0c…32-hex",
      "kind": "uncaughtException",
      "version": "0.24.0",
      "name": "TypeError",
      "message": "Cannot read properties of undefined (reading 'id')",
      "stack": "TypeError: …\n    at render (node_modules/@organizaone/o1-code/dist/cli.js:10:5)",
      "count": 3,
      "firstSeen": "2026-11-09T10:00:00.000Z",
      "lastSeen": "2026-11-09T11:00:00.000Z"
    }
  ]
}
```

| Field                   | Rule                                                   |
| :---------------------- | :----------------------------------------------------- |
| `client`                | as in `/usage`                                         |
| `installationId`        | **absent**: a body that has it is refused with `400`   |
| `errors`                | 1 to 20 entries                                        |
| `fingerprint`           | 32 lowercase hex characters                            |
| `kind`                  | `uncaughtException`, `unhandledRejection`              |
| `version`               | as `client.version`; the version the error happened in |
| `name`                  | 1 to 64 characters                                     |
| `message`               | up to 500 characters                                   |
| `stack`                 | up to 8000 characters                                  |
| `count`                 | an integer from 1 to 1,000,000,000                     |
| `firstSeen`, `lastSeen` | ISO 8601 timestamps, `firstSeen` not after `lastSeen`  |

A group is identified by `fingerprint` and `version`. Each report adds its `count` to the stored one,
and keeps the earliest `firstSeen` and the latest `lastSeen`. Reports carry no identifier, so how
many installations a group reached is not known; `count` is the number of occurrences. Nothing about
the request ties a report to an installation on the intake either: neither the address nor a link to
`/usage` requests is stored.

### Limits and privacy on the intake

- Usage bodies over 256 KB and error bodies over 64 KB are refused with `413` (the client keeps
  under 250 KB and 60 KB, dropping the oldest days or leaving reports for the next request); more
  than 30 requests a minute from one address with `429`.
- The address is used for that limit and to derive the country, and is not stored.
- Retention: usage and activity 400 days; error groups 90 days after `lastSeen`.
