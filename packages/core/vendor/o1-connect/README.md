# o1-connect library (vendored)

The client library of o1-gateway (OrganizaOne AI Gateway), used by the "o1-gateway device code"
provider: the pinned tunnel of `o1-connect run` started inside o1-code, with a loopback endpoint
that speaks the proxy's API and swaps the device token in.

- `lib.mjs`: the library, one dependency-free ES module (`node:` modules only). Since 9.9.0 it
  also exports `openRemote`, the terminal's side of a remote session (contract §5). Since
  12.18.0 its loopback endpoint answers `HEAD` and `GET /health` without the local key, with
  whether the gateway answers through the tunnel.
- `lib.d.mts`: its types.

Both are copied, never loaded at run time: the library is what protects the session on a network
that intercepts TLS, so it must not come over one. Update them on purpose, like any vendored
dependency, and update `VENDOR.json` with the new version and hashes; the test
`packages/core/src/providers/o1-connect/vendor.test.ts` refuses a copy that does not match.

Prettier excludes the pinned runtime. The files are the gateway's own bytes, with no
local change: a fix the library needs is made in the gateway and vendored from there.
The vendor test verifies their byte identity and loads the relay for execution. It
also exercises the real loopback relay against a connection reset after the request
body is read: a request carrying `x-o1gw-conversation-id` or
`x-o1gw-conversation-transfer` is sent once and answered `502`, never replayed, because
a reused tunnel socket can fail after a native request has already been consumed.

|                             |                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Version                     | 12.18.3 (`// o1-connect-lib 12.18.3`)                                                  |
| Source                      | `github.com/organizaone/o1-gateway`, commit `afc2264d3f594243a122bd0bd00d9c2a74f03852` |
| `lib.mjs` SHA-256           | `79a9606f3ae6d4b890e9aeda2cee6d70885dd2ed0437edbc92c785709170e4c5`                     |
| `lib.d.mts` SHA-256         | `3d37e549a906bfd695f518bfd701249d4d19d379b788931022894e5f4a6dfd7b`                     |
| Checked against the gateway | 2026-11-18, against the `lib.mjs.sha256` the gateway serves beside the file            |

License: the one named in the banner of each file.

The library omits its identifying User-Agent in outer tunnel requests by default.
o1-code keeps that default: it does not set `identify: true` when opening a
connection. Optional `urls` in connection codes, setup information, and stored
credentials continue to provide ordered host failover.
