# o1-connect library (vendored)

The client library of o1-gateway (OrganizaOne AI Gateway), used by the "o1-gateway device code"
provider: the pinned tunnel of `o1-connect run` started inside o1-code, with a loopback endpoint
that speaks the proxy's API and swaps the device token in.

- `lib.mjs`: the library, one dependency-free ES module (`node:` modules only). Since 9.9.0 it
  also exports `openRemote`, the terminal's side of a remote session (contract §5).
- `lib.d.mts`: its types.

Both are copied, never loaded at run time: the library is what protects the session on a network
that intercepts TLS, so it must not come over one. Update them on purpose, like any vendored
dependency, and update `VENDOR.json` with the new version and hashes; the test
`packages/core/src/providers/o1-connect/vendor.test.ts` refuses a copy that does not match.

The local lint-staged configuration checks the library's syntax without formatting it, so
pre-commit checks preserve the upstream bytes and their recorded hash.

|                             |                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Version                     | 9.9.0 (`// o1-connect-lib 9.9.0`)                                                      |
| Source                      | `github.com/organizaone/o1-gateway`, commit `a7234d36eca4d9bc6b73c68d26494e21a44b6cae` |
| `lib.mjs` SHA-256           | `3f1784b067660cfd2866a023885948f1a246c029ee9a3dc73f1a126072c7d0fb`                     |
| `lib.d.mts` SHA-256         | `242576aa4d42aa82665f7bd570b5b0f432e2df497e7ed0586ceb850b3fe250e4`                     |
| Checked against the gateway | 2026-10-11, `https://api.organizaone.com/client/lib.mjs.sha256` compared with `shasum` |

License: MIT (the banner of each file).

The library omits its identifying User-Agent in outer tunnel requests by default.
o1-code keeps that default: it does not set `identify: true` when opening a
connection. Optional `urls` in connection codes, setup information, and stored
credentials continue to provide ordered host failover.
