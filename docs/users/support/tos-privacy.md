# O1-Code: Terms of Service and Privacy Notice

O1-Code is an open-source AI coding assistant, licensed under Apache-2.0. It does not run a model
service of its own: you connect it to a model provider, and that provider's terms apply to what you
send it.

## Which terms apply

O1-Code talks to the provider you configure with `/auth` or in `modelProviders`: a built-in
provider, or any OpenAI-compatible or Anthropic endpoint given by its base URL.

| What you use                  | Terms of Service and Privacy Notice                                             |
| :---------------------------- | :------------------------------------------------------------------------------ |
| A built-in or custom provider | The provider's own terms and privacy policy (OpenAI, Anthropic, DeepSeek, etc.) |
| A local model server          | Nothing leaves your machine except what your own server does with it            |

> [!important]
>
> When you use a provider's API key, you are subject to that provider's terms and privacy policy, not
> O1-Code's. Review the provider's documentation for how it uses, retains and protects your data.

## Usage metrics and error reports

O1-Code sends two kinds of anonymous data to OrganizaOne, the project's maintainer, at
`https://api.organizaone.com/telemetry/v1`. Both are **on by default**, and each has its own switch.
Nothing is sent to any third party.

**Usage metrics**, at most once an hour, identify the installation only by the random ID O1-Code
creates in `~/.o1-code/installation_id`:

- the O1-Code version, operating system and architecture, Node.js major version, how O1-Code was
  installed (npm, standalone, Homebrew) and the system locale;
- per day: how many sessions were started and how (interactive, headless, SDK), how many prompts were
  sent, how many times each built-in tool and built-in slash command was used, the kind of provider
  answering (OrganizaOne, OpenAI-compatible, Anthropic, Gemini) with token totals, the API errors by
  status code, and how many subagents ran.

**Error reports** describe a crash of O1-Code itself: the error type and message and its stack trace,
the version and the system. They carry no identifier, not even the installation ID, so a report
cannot be tied to you or to your usage metrics. Before anything is stored, O1-Code removes your home directory, reduces
every other path to its file name (or to the part inside `node_modules`), and replaces URLs, e-mail
addresses, credentials and token-like strings, and quoted text longer than a name. A report waits
on disk and is sent at the next opportunity.

**Never sent:** your prompts, the model's answers, code, file contents, file and project names,
paths, environment variables, the address of your provider, the names of MCP servers and their tools,
and the names of your own slash commands. The intake records the country your request comes from and
does not keep your IP address.

### Turning them off

| To stop       | Setting                                 | Environment variable                    |
| :------------ | :-------------------------------------- | :-------------------------------------- |
| Usage metrics | `privacy.usageStatisticsEnabled: false` | `O1CODE_USAGE_STATISTICS_ENABLED=false` |
| Error reports | `privacy.errorReportsEnabled: false`    | `O1CODE_ERROR_REPORTS_ENABLED=false`    |
| Both          |                                         | `DO_NOT_TRACK=1`                        |

Both settings are also in `/settings`. Turning one off discards what was waiting to be sent.

### OpenTelemetry

O1-Code can also export OpenTelemetry data for your own observability, which is **off by default**.
When you turn it on, the data goes only to the endpoint you configure — `localhost:4317` unless you
set another — and never to OrganizaOne.

### What your model provider receives

Using any model means sending it your prompts and the context O1-Code attaches to them (file
contents, command output), and receiving its responses. What the provider does with that is governed
by its own terms, not by O1-Code.

## Frequently asked questions

### 1. Is my code, including prompts and answers, used to train AI models?

O1-Code itself does not use your prompts, code or responses for anything. Whether a provider uses
them for training depends entirely on that provider's policy; review the privacy policy and terms of
service of the provider you connect to.

### 2. What do the Usage Statistics and Error Reports settings control?

Only the anonymous data described in [Usage metrics and error reports](#usage-metrics-and-error-reports).
They do not affect what your model provider receives — see
[What your model provider receives](#what-your-model-provider-receives). Usage Statistics also keeps
the local token-usage record that `/stats` reads.

### 3. How do I switch between providers?

1. **During startup**: choose a provider when prompted.
2. **Within the CLI**: run `/auth` to connect another provider, or `/model` to switch between the
   models you have configured.
3. **Environment variables**: set the API key in the environment variable your `modelProviders`
   entry names in `envKey`, or in a `.env` file.

See [Authentication](../configuration/auth.md) for details.
