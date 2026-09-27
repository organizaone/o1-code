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

## Usage statistics and telemetry

O1-Code does not collect or send usage statistics, and no setting turns such a transport on.

O1-Code can export OpenTelemetry data, which is **off by default**. When you turn it on, the data
goes only to the endpoint you configure — `localhost:4317` unless you set another. Nothing is sent to
the O1-Code project or to any third party.

### What your model provider receives

Using any model means sending it your prompts and the context O1-Code attaches to them (file
contents, command output), and receiving its responses. What the provider does with that is governed
by its own terms, not by O1-Code.

## Frequently asked questions

### 1. Is my code, including prompts and answers, used to train AI models?

O1-Code itself does not use your prompts, code or responses for anything. Whether a provider uses
them for training depends entirely on that provider's policy; review the privacy policy and terms of
service of the provider you connect to.

### 2. What does the Usage Statistics setting control?

Nothing leaves your machine because of it. Events are at most kept in memory for the length of a
session and then discarded. The setting does not affect what your model provider receives — see
[What your model provider receives](#what-your-model-provider-receives).

### 3. How do I switch between providers?

1. **During startup**: choose a provider when prompted.
2. **Within the CLI**: run `/auth` to connect another provider, or `/model` to switch between the
   models you have configured.
3. **Environment variables**: set the API key in the environment variable your `modelProviders`
   entry names in `envKey`, or in a `.env` file.

See [Authentication](../configuration/auth.md) for details.
