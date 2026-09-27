# Authentication

O1-Code talks to the model provider you connect. The `/auth` dialog, **Connect a provider**, opens on
four entries:

- **OrganizaOne**: connect with the key from the OrganizaOne console. **Sign in with your account**
  and **aipp device code** are listed too, disabled and marked `coming soon`: they depend on the
  OrganizaOne server and have no handler yet.
- **API key**: one alphabetical list of the built-in providers you connect with a key —
  Alibaba Cloud, Anthropic, DeepSeek, Google Gemini, Kimi (Moonshot), MiniMax, ModelScope, OpenAI,
  xAI and Z.AI. **Alibaba Cloud** opens a second list with its three plans: **Coding Plan** (for individual
  developers, weekly quota included), **Token Plan** (for teams and companies, usage-based billing
  with a dedicated endpoint) and **Standard API Key** (an existing ModelStudio API key).
- **Local**: models running on this machine — Ollama, LM Studio, or another local server. They
  need no key (see [Local servers](#local-servers)).
- **Custom**: any endpoint given by its base URL — a proxy, a gateway, or a provider without a
  preset. Supports the OpenAI, Anthropic, and Gemini protocols.

The key you enter in `/auth` is saved in the credential store, not in `settings.json` (see
[Where `/auth` saves your key](#where-auth-saves-your-key)). The sections below start with the
most general path: an API key and a provider by URL, configured in `settings.json`.

## Option 1: API key and a provider by URL

Use this to connect to any provider, such as OpenAI, Anthropic, Google, Azure OpenAI, ModelScope, a gateway, or a self-hosted endpoint. Supports multiple protocols and providers.

### Recommended: One-file setup via `settings.json`

The simplest way to get started with API Key authentication is to put everything in a single `~/.o1-code/settings.json` file. Here's a complete, ready-to-use example:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "deepseek-chat",
        "name": "DeepSeek Chat",
        "baseUrl": "https://api.deepseek.com/v1",
        "description": "DeepSeek through its OpenAI-compatible API",
        "envKey": "DEEPSEEK_API_KEY"
      }
    ]
  },
  "env": {
    "DEEPSEEK_API_KEY": "sk-xxxxxxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "deepseek-chat"
  }
}
```

What each field does:

| Field                        | Description                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Declares which models are available and how to connect to them. Keys (`openai`, `anthropic`, `gemini`) represent the API protocol.            |
| `env`                        | Stores API keys directly in `settings.json` as a fallback (lowest priority — shell `export` and `.env` files take precedence).                |
| `security.auth.selectedType` | Tells O1-Code which protocol to use on startup (e.g. `openai`, `anthropic`, `gemini`). Without this, you'd need to run `/auth` interactively. |
| `model.name`                 | The default model to activate when O1-Code starts. Must match one of the `id` values in your `modelProviders`.                                |

After saving the file, just run `o1-code` — no interactive `/auth` setup needed.

> [!tip]
>
> The sections below explain each part in more detail. If the quick example above works for you, feel free to skip ahead to [Security notes](#security-notes).

The key concept is **Model Providers** (`modelProviders`): O1-Code supports multiple API protocols, not just OpenAI. You configure which providers and models are available by editing `~/.o1-code/settings.json`, then switch between them at runtime with the `/model` command.

#### Supported protocols

| Protocol          | `modelProviders` key | Environment variables                                                                                                                                          | Providers                                                                                      |
| ----------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| OpenAI-compatible | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` (alias: `O1CODE_MODEL`)                                                                                    | OpenAI, Azure OpenAI, ModelScope, Alibaba Cloud, local servers, any OpenAI-compatible endpoint |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                                                                                   | Anthropic Claude                                                                               |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                                                                               | Google Gemini                                                                                  |
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY` + `GOOGLE_MODEL` (sets `GOOGLE_GENAI_USE_VERTEXAI=true`) or `GOOGLE_CLOUD_PROJECT` + `GOOGLE_MODEL` (keyless ADC); uses the `gemini` protocol | Google Vertex AI                                                                               |

#### Step 1: Configure models and providers in `~/.o1-code/settings.json`

Define which models are available for each protocol. Each model entry requires at minimum an `id`; `envKey` (the environment variable name that holds your API key) is optional and recommended — when omitted, it falls back to the auth type's default env key (e.g. `OPENAI_API_KEY` for `openai`).

> [!important]
>
> It is recommended to define `modelProviders` in the user-scope `~/.o1-code/settings.json` to avoid merge conflicts between project and user settings.

Edit `~/.o1-code/settings.json` (create it if it doesn't exist). You can mix multiple protocols in a single file — here is a multi-provider example showing just the `modelProviders` section:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ],
    "anthropic": [
      {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "envKey": "ANTHROPIC_API_KEY"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "envKey": "GEMINI_API_KEY"
      }
    ]
  }
}
```

> [!tip]
>
> Don't forget to also set `env`, `security.auth.selectedType`, and `model.name` alongside `modelProviders` — see the [complete example above](#recommended-one-file-setup-via-settingsjson) for reference.

**`ModelConfig` fields (each entry inside `modelProviders`):**

| Field              | Required | Description                                                                                                                                        |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Yes      | Model ID sent to the API (e.g. `gpt-4o`, `claude-sonnet-4-20250514`)                                                                               |
| `wireApi`          | No       | OpenAI-compatible request format: `chat-completions` or `responses`. Omit to inherit the provider protocol.                                        |
| `name`             | No       | Display name in the `/model` picker (defaults to `id`)                                                                                             |
| `envKey`           | No       | Environment variable name for the API key (e.g. `OPENAI_API_KEY`); optional/recommended — defaults to the auth type's default env key when omitted |
| `credential`       | No       | Id of the key saved in `~/.o1-code/credentials/<id>.json`, read when the `envKey` variable is not set; `/auth` writes it                           |
| `baseUrl`          | No       | API endpoint override (useful for proxies or custom endpoints)                                                                                     |
| `generationConfig` | No       | Fine-tune `timeout`, `maxRetries`, `samplingParams`, etc.                                                                                          |

> [!note]
>
> When using the `env` field in `settings.json`, credentials are stored in plain text. For better security, prefer `.env` files or shell `export` — see [Step 2](#step-2-set-environment-variables).

For the full `modelProviders` schema and advanced options like `generationConfig`, `customHeaders`, and `extra_body`, see [Model Providers Reference](model-providers.md).

#### Step 2: Set environment variables

O1-Code reads API keys from environment variables (specified by `envKey` in your model config). There are multiple ways to provide them, listed below from **highest to lowest priority**:

**1. Shell environment / `export` (highest priority)**

Set directly in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.) or inline before launching:

```bash

# OpenAI / OpenAI-compatible
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env` files**

O1-Code auto-loads the **first** `.env` file it finds (variables are **not merged** across multiple files). Only variables not already present in `process.env` are loaded.

Search order (from the current directory, walking upward toward `/`):

1. `.o1-code/.env` (preferred — keeps O1-Code variables isolated from other tools)
2. `.env`

If nothing is found, it falls back to your **home directory**:

3. `~/.o1-code/.env`
4. `~/.env`

> [!tip]
>
> `.o1-code/.env` is recommended over `.env` to avoid conflicts with other tools. Some variables (like `DEBUG` and `DEBUG_MODE`) are excluded from project-level `.env` files to avoid interfering with O1-Code behavior.

**3. `settings.json` → `env` field (lowest priority)**

You can also define API keys directly in `~/.o1-code/settings.json` under the `env` key. These are loaded as the **lowest-priority fallback** — only applied when a variable is not already set by the system environment or `.env` files.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

This is the approach used in the [one-file setup example](#recommended-one-file-setup-via-settingsjson) above. It's convenient for keeping everything in one place, but be mindful that `settings.json` may be shared or synced — prefer `.env` files for sensitive secrets.

**Priority summary:**

| Priority    | Source                         | Override behavior                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1 (highest) | CLI flags (`--openai-api-key`) | Always wins                                  |
| 2           | System env (`export`, inline)  | Overrides `.env` and `settings.json` → `env` |
| 3           | `.env` file                    | Only sets if not in system env               |
| 4 (lowest)  | `settings.json` → `env`        | Only sets if not in system env or `.env`     |

#### Step 3: Switch models with `/model`

After launching O1-Code, use the `/model` command to switch between all configured models. Models are grouped by protocol:

```
/model
```

The picker will show all models from your `modelProviders` configuration, grouped by their protocol (e.g. `openai`, `anthropic`, `gemini`). Your selection is persisted across sessions.

You can also switch models directly with a command-line argument, which is convenient when working across multiple terminals.

```bash
# In one terminal

o1-code --model "gpt-4o"

# In another terminal

o1-code --model "claude-sonnet-4-20250514"
```

## Option 2: A built-in provider

Run `/auth`, choose **API key** (or **OrganizaOne**), pick a provider and enter its API key. O1-Code
fills in the provider's base URL and offers its models; you choose which ones to configure. The
result is a `modelProviders` entry like the ones in Option 1, which you can edit later. OpenRouter
and Requesty no longer have presets: connect them through **Custom** with their base URL; an entry
you already saved keeps working.

- **OrganizaOne** → **API key**: enter the device token from the OrganizaOne console and choose
  the protocol, Anthropic (`https://api.organizago.com`) or OpenAI-compatible
  (`https://api.organizago.com/v1`). The models come from the account's `/v1/models`.
- **Anthropic**, **OpenAI** and **Google Gemini**: enter the key from the provider's console; the
  models come from the provider's model list. OpenAI also asks for the API format (Chat Completions
  or Responses).

### Local servers

**Local** lists the model servers on this machine. When the dialog opens, O1-Code asks Ollama
(`http://127.0.0.1:11434`) and LM Studio (`http://127.0.0.1:1234`) whether they run; the main
screen marks Local with `● Ollama detected` (or `● LM Studio detected`) when one answers, and
`… looking` while it asks. In the Local list a running server shows `● detected · N models`; one
that did not answer shows `○ not running` and cannot be chosen until you start it and press
`ctrl+r`, which asks again.

Choosing a detected server skips the key: the models step opens on the models the server listed,
all checked. **Other local server** asks for a port (for example `8080`, read as
`http://127.0.0.1:8080/v1`) or a full URL, then lists that server's models through `/models`.
Local servers are saved with the placeholder key `local`, because OpenAI clients refuse an empty
one.

In the Web Shell, the daemon asks the servers on its own host (the browser cannot reach it), and
**Look again** asks again.

## Where `/auth` saves your key

`/auth` saves each key in its own file, `~/.o1-code/credentials/<provider-id>.json` (for example
`anthropic.json`, `organizaone.json`, or `custom-<hash>.json` for a Custom endpoint), not in
`settings.json`. The directory is created with mode `0700` and each file with mode `0600` where the
platform honours modes; on Windows your user profile's permissions protect it, as they protect
`settings.json`. The model entries in `settings.json` only name the saved key, with
`"credential": "<provider-id>"`.

When a model runs, O1-Code reads its key from the entry's `envKey` variable first, so a key exported
in your shell or a `.env` file always wins, and then from the saved credential the entry names.

To forget a saved key, run:

```bash
o1-code auth logout <provider-id>
```

It deletes the file and removes the `credential` reference from the model entries in your user and
workspace settings, and prints what it removed.

## Option 3: Alibaba ModelStudio

### Coding Plan

Use this if you want predictable costs with diverse model options and higher usage quotas.

- **How it works**: Subscribe to the Coding Plan with a fixed monthly fee, then configure O1-Code to use the dedicated endpoint and your subscription API key.
- **Requirements**: Obtain an active Coding Plan subscription from [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) or [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), depending on the region of your account.
- **Benefits**: Diverse model options, higher usage quotas, predictable monthly costs, access to a wide range of models (Qwen, GLM, Kimi, Minimax and more).
- **Cost & quota**: View Aliyun ModelStudio Coding Plan documentation[Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Alibaba Cloud Coding Plan is available in two regions:

| Region                       | Console URL                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Beijing) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

#### Interactive setup

Enter `o1-code` in the terminal to launch O1-Code, then run the `/auth` command, select **API key** → **Alibaba Cloud**, and choose **Coding Plan**. Choose your region, then enter your `sk-sp-xxxxxxxxx` key.

After authentication, use the `/model` command to switch between all Alibaba Cloud Coding Plan supported models (including qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5, and MiniMax-M2.5).

#### Headless or scripted setup

For CI, containers, or scripts, configure Coding Plan with environment variables or `settings.json` instead of the interactive `/auth` flow.

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Use `https://coding.dashscope.aliyuncs.com/v1` for the China (Beijing) endpoint, or `https://coding-intl.dashscope.aliyuncs.com/v1` for the international endpoint.

#### Alternative: configure via `settings.json`

If you prefer to skip the interactive `/auth` flow, add the following to `~/.o1-code/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
        "envKey": "BAILIAN_CODING_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_CODING_PLAN_API_KEY": "sk-sp-xxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

> [!note]
>
> The Coding Plan uses a dedicated endpoint (`https://coding.dashscope.aliyuncs.com/v1`) that is different from the standard Dashscope endpoint. Make sure to use the correct `baseUrl`.

### Token Plan

Use this if your team or company prefers usage-based billing on a dedicated ModelStudio endpoint.

- **How it works**: Subscribe to the Token Plan in Alibaba Cloud ModelStudio, then configure O1-Code to use the region-specific Token Plan endpoint and your API key. You are billed for actual token usage instead of a fixed monthly fee.
- **Requirements**: Obtain a Token Plan API key from [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) or [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model), depending on the region of your account.
- **Benefits**: Usage-based billing for teams and companies, dedicated region-specific endpoints, access to a wide range of models (Qwen, DeepSeek, GLM, Kimi, Minimax and more).
- **Cost & quota**: View Alibaba Cloud ModelStudio Token Plan documentation [Beijing](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model).

Token Plan is available in two regions, each with its own dedicated endpoint:

| Region                    | Endpoint                                                                 | Console URL                                                                                         |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| China (Beijing)           | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`     | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing)                         |
| Singapore (International) | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | [modelstudio.console.alibabacloud.com](https://modelstudio.console.alibabacloud.com/ap-southeast-1) |

#### Interactive setup

Enter `o1-code` in the terminal to launch O1-Code, then run the `/auth` command, select **API key** → **Alibaba Cloud**, and choose **Token Plan**. Choose your region (**China (Beijing)** or **Singapore (International)**), then enter your API key. The wizard then shows its final step (Step 3/3 · Model IDs), where you pick the model IDs to configure: the models served by your endpoint are offered there and are applied only when you explicitly select them. Token Plan API keys have no prefix requirement (unlike Coding Plan keys, which start with `sk-sp-`).

After authentication, use the `/model` command to browse and switch between the models configured for your Token Plan. The model lineup evolves over time, so it is intentionally not listed here; model discovery from the endpoint happens during the `/auth` setup step above (the endpoint's own list is offered there and must be selected explicitly), and `/model` then shows the models configured for your plan.

#### Headless or scripted setup

For CI, containers, or scripts, configure Token Plan with environment variables or `settings.json` instead of the interactive `/auth` flow.

```bash
export BAILIAN_TOKEN_PLAN_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.7-plus"
```

Use `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` for the China (Beijing) endpoint, or `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` for the international (Singapore) endpoint. Replace `qwen3.7-plus` with any model included in your plan.

Note that `BAILIAN_TOKEN_PLAN_API_KEY` is a provider-specific key: it takes effect once the `settings.json` provider entry in the next section exists, because that entry declares it as the `envKey`. To select OpenAI-compatible auth with environment variables alone, export `OPENAI_API_KEY` instead — provider-specific keys do not select the auth type by themselves.

#### Alternative: configure via `settings.json`

If you prefer to skip the interactive `/auth` flow, add the following to `~/.o1-code/settings.json`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "name": "qwen3.7-plus (Token Plan)",
        "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        "description": "qwen3.7-plus from Alibaba Cloud Token Plan",
        "envKey": "BAILIAN_TOKEN_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_TOKEN_PLAN_API_KEY": "your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.7-plus"
  }
}
```

> [!note]
>
> The Token Plan uses dedicated, region-specific endpoints (`*.maas.aliyuncs.com`) that are different from the standard DashScope endpoint. Make sure the `baseUrl` matches the region of your subscription.

## Security notes

- Don't commit API keys to version control.
- Keys entered in `/auth` live in `~/.o1-code/credentials/`, outside `settings.json`; don't copy
  that directory when you share or sync your settings.
- Prefer `.o1-code/.env` for project-local secrets (and keep it out of git).
- Treat your terminal output as sensitive if it prints credentials for verification.
