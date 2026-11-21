# o1-connect library (vendored)

The client library of o1-gateway (OrganizaOne AI Gateway), used by the "o1-gateway device code"
provider: the pinned tunnel of `o1-connect run` started inside o1-code, with a loopback endpoint
that speaks the proxy's API as this device.

- `lib.mjs`: the library, one dependency-free ES module (`node:` modules only). Since 9.9.0 it
  also exports `openRemote`, the terminal's side of a remote session (contract §5). Since
  12.18.0 its loopback endpoint answers `HEAD` and `GET /health` without the local key, with
  whether the gateway answers through the tunnel. Since 13.0.0 a connection code (`o1gw2.`)
  works once: `setup` is online, makes the device's key pair on the machine and enrols the
  public key; each tunnel proves that key, so no request carries a gateway credential. The
  store entry is the library's own and opaque to o1-code; an entry or a code from an earlier
  version is refused, not migrated.
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
| Version                     | 13.0.0 (`// o1-connect-lib 13.0.0`)                                                    |
| Source                      | `github.com/organizaone/o1-gateway`, commit `219f6c47b04cb82f861e48d2aa507107fc8d63f6` |
| `lib.mjs` SHA-256           | `47fdda1e00111c32c83e2d6b15aba0002253a055327576b1a77aae83ff416588`                     |
| `lib.d.mts` SHA-256         | `77bf29569a332f1f6feff1dd95c98b327d701d4794ba5b7d9a733528438ea4be`                     |
| Checked against the gateway | 2026-11-21, against the `lib.mjs.sha256` the gateway serves beside the file            |

License: the one named in the banner of each file.

The library omits its identifying User-Agent in outer tunnel requests by default.
o1-code keeps that default: it does not set `identify: true` when setting up
or opening a connection. Optional `urls` in connection codes and setup
information continue to provide ordered host failover.
