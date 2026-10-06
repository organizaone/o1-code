# o1-connect library (vendored)

The client library of o1-gateway (OrganizaOne AI Gateway), used by the "o1-gateway device code"
provider: the pinned tunnel of `o1-connect run` started inside o1-code, with a loopback endpoint
that speaks the proxy's API and swaps the device token in.

- `lib.mjs`: the library, one dependency-free ES module (`node:` modules only).
- `lib.d.mts`: its types.

Both are copied, never loaded at run time: the library is what protects the session on a network
that intercepts TLS, so it must not come over one. Update them on purpose, like any vendored
dependency, and update `VENDOR.json` with the new version and hashes; the test
`packages/core/src/providers/o1-connect/vendor.test.ts` refuses a copy that does not match.

The local lint-staged configuration checks the library's syntax without formatting it, so
pre-commit checks preserve the upstream bytes and their recorded hash.

|                                     |                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| Version                             | 9.4.0 (`// o1-connect-lib 9.4.0`)                                                      |
| Source                              | `github.com/organizaone/o1-gateway`, commit `eb849d839dca8a53958885bb0cfe1320b09fd24b` |
| `lib.mjs` SHA-256                   | `06c4176a6cfd975c70e8c079bdb93ed1024e3076090c77d066d12cef5a305db1`                     |
| `lib.d.mts` SHA-256                 | `852feb8f9dbb324c5118e9ca8d92371abc2364b0536e161bfb7682fd1dd6eafe`                     |
| Checked against local gateway build | 2026-10-06, source and copy compared with `Get-FileHash`                               |

License: MIT (the banner of each file).

The library omits its identifying User-Agent in outer tunnel requests by default.
o1-code keeps that default: it does not set `identify: true` when opening a
connection. Optional `urls` in connection codes, setup information, and stored
credentials continue to provide ordered host failover.
