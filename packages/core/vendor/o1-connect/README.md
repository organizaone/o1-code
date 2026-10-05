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

|                                              |                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Version                                      | 9.0.0 (`// o1-connect-lib 9.0.0`)                                  |
| Source                                       | `github.com/organizaone/o1-gateway`, commit `a1f0347`              |
| `lib.mjs` SHA-256                            | `861acb656291d43c5179a9b9af485a37d052722a308c3164a70a5dcd35d2ff8b` |
| `lib.d.mts` SHA-256                          | `3da12d175e67dc432bc1bd661f2a9015406213f13baf1782af5d3d6b9ebaae38` |
| Checked against `GET /client/lib.mjs.sha256` | 2026-10-04, from a trusted network                                 |

License: MIT (the banner of each file).
