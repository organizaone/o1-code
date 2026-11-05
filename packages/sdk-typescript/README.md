# @organizaone/o1-code-sdk

TypeScript SDK for driving o1-code from code. Not yet published; build it from this repository.

For a gateway account change with existing conversation input, `query.setModel(model,
confirmHistory)` asks the caller to approve sending that history to the destination.
The optional callback receives the conversation, source, destination and token/context
notice and must return `true` to confirm. Omitting it fails explicitly when consent
is required; it never silently completes a refused selection. Consent is scoped to
that conversation and destination and is invalidated by a configuration change.
