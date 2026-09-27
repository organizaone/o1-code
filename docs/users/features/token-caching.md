# Token Caching and Cost Optimization

Caching lowers the price of the prefix every request carries. To make that prefix smaller in the first place — fewer resident tool schemas, smaller context files — see [Resident Context Cost](context-cost.md); the two compose.

O1-Code automatically optimizes API costs through token caching when using API key authentication. This feature stores frequently used content like system instructions and conversation history to reduce the number of tokens processed in subsequent requests.

## How It Benefits You

- **Cost reduction**: Less tokens mean lower API costs
- **Faster responses**: Cached content is retrieved more quickly
- **Automatic optimization**: No configuration needed - it works behind the scenes

## Token caching is available for

- API key users of providers that support prompt caching (OpenAI-compatible and Anthropic)

## Monitoring Your Savings

Use the `/stats` command to see your cached token savings:

- When active, the stats display shows how many tokens were served from cache
- You'll see both the absolute number and percentage of cached tokens
- Example: "10,500 (90.4%) of input tokens were served from the cache, reducing costs."

This information is only displayed when cached tokens are being used.
