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
| Version                             | 9.2.0 (`// o1-connect-lib 9.2.0`)                                                      |
| Source                              | `github.com/organizaone/o1-gateway`, commit `cfa2fc9cb3cbce7c1d2cdee7c9d2886d1cd3f058` |
| `lib.mjs` SHA-256                   | `51f2f61ebb4531b044f9697475f3c2a9c44571edeb0f526b4d9f7b12d9757fc0`                     |
| `lib.d.mts` SHA-256                 | `cbccced28dfa777cbbe683859349a30afd54a617a69c31b02989125b9d33b829`                     |
| Checked against local gateway build | 2026-10-06, source and copy compared with `Get-FileHash`                               |

License: MIT (the banner of each file).
