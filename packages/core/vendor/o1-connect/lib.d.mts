// o1-connect-lib 9.2.0 - https://github.com/organizaone/o1-gateway (MIT)
/**
 * o1-connect as a library (docs/O1-CODE-LOGIN.md §3): the pinned tunnel
 * of `o1-connect run`, started inside the host app instead of as a
 * separate process. Bundled by scripts/build-client.mjs into
 * dist/client/lib.mjs (dependency-free, node: modules only) with its types
 * in lib.d.ts / lib.d.mts, and served by the proxy under /client/.
 *
 * - setup(code, { store, onFingerprint }) reads an `o1gw1.` connection code,
 *   shows every proxy key's fingerprint to the app (which asks its user to
 *   compare them with the console, off this network), and only on a yes
 *   saves the configuration through the app's store.
 * - open({ store }) starts the tunnel and a loopback endpoint that speaks the
 *   proxy's API with the device token swapped in, and returns its base URL, a
 *   per-session key for it, and close().
 * - forget({ store }) deletes the saved configuration.
 *
 * Secrets (the device token) live only in the app's SecretStore and in this
 * process's memory: the library writes no file, sets no environment
 * variable and logs nothing of its own. It reads HTTPS_PROXY / NO_PROXY for
 * the tunnel's outer connection, as the CLI does. Every public type is
 * declared in this file, so the emitted lib.d.ts stands alone.
 */
/** This library's version (the proxy's version it was built with; "dev" unbundled). */
export declare const version: string;
/**
 * Where the library keeps its configuration (the proxy's URL, the device's
 * name, the pinned keys and the device token), implemented by the host app:
 * the OS keychain, DPAPI, a passphrase-sealed file of its own. One entry, a
 * JSON string, under `name` (default "aipp-connect"). The library calls
 * nothing else to keep a secret.
 */
export interface SecretStore {
    /** The value saved under `name`, or null / undefined when there is none. */
    get(name: string): Promise<string | null | undefined>;
    set(name: string, value: string): Promise<void>;
    /** Deletes the entry; deleting one that does not exist is not an error. */
    delete(name: string): Promise<void>;
}
/** How the tunnel is reached: `auto` tries the WebSocket, then POST. */
export type Transport = "auto" | "websocket" | "post";
export type O1ConnectErrorCode = 
/** The connection code is not an `o1gw1.` code, or is damaged. */
"invalid_code"
/** onFingerprint answered no: nothing was saved. */
 | "fingerprint_rejected"
/** The store holds no configuration under this name: run setup. */
 | "not_set_up"
/** The store's entry is not a configuration this library saved. */
 | "invalid_config"
/** The app's store threw; its error is the `cause`. */
 | "store_failed"
/** The proxy presented a key that is not pinned: possible interception. Nothing was sent. */
 | "identity_mismatch"
/** The tunnel could not be opened or did not answer (network, proxy, device not allowed to tunnel). */
 | "tunnel_unavailable"
/** The local port asked for is taken. */
 | "port_in_use"
/** The loopback endpoint could not listen for another reason (EACCES, EADDRNOTAVAIL: a port the OS reserves or forbids); the message names it. */
 | "port_unavailable";
export declare class O1ConnectError extends Error {
    readonly code: O1ConnectErrorCode;
    constructor(code: O1ConnectErrorCode, message: string, options?: {
        cause?: unknown;
    });
}
export interface SetupInfo {
    /** The device the code is for. */
    device: string;
    /** The proxy's base URL. */
    url: string;
    /** The failover hosts after `url` (a multihost code): the session tries them in order while one cannot be reached. */
    urls?: string[];
}
export interface SetupOptions {
    store: SecretStore;
    /**
     * Shows the fingerprint of every key the code pins (16 groups of 4 hex
     * digits each) and answers whether the user confirmed that each one
     * matches the console's list, read on a device off this network. Every
     * pin is trusted, so every one must be shown. False (or a throw) saves
     * nothing.
     */
    onFingerprint(fingerprints: string[], info: SetupInfo): boolean | Promise<boolean>;
    /** Default `auto`. */
    transport?: Transport;
    /** The store entry's name; default "aipp-connect". */
    name?: string;
}
export interface SetupResult extends SetupInfo {
    fingerprints: string[];
}
export interface OpenOptions {
    store: SecretStore;
    /** The store entry's name; default "aipp-connect". */
    name?: string;
    /** The loopback port; default 0 (a free one, picked by the OS). */
    port?: number;
    /**
     * Default true: open() asks the proxy for its keys through the tunnel before
     * it resolves, so a network that swaps the key, or a proxy that refuses the
     * device, fails open() instead of the app's first request. False: nothing
     * is contacted until the first request.
     */
    check?: boolean;
    /** Lines without secrets (routes, statuses, timings, tunnel events); default: none. */
    log?(line: string): void;
    /** A tunnel met a key that is not pinned (possible interception); the tunnel waits before trying again. */
    onMismatch?(receivedPin: string): void;
}
export interface Connection {
    /** `http://127.0.0.1:<port>`: the Anthropic protocol's base URL. */
    baseUrl: string;
    /** `http://127.0.0.1:<port>/v1`: the OpenAI protocol's base URL. */
    openaiBaseUrl: string;
    /**
     * The key the endpoint asks for (Authorization: Bearer, or x-api-key),
     * made for this session and never saved: other local processes cannot use
     * the endpoint without it. Not the device token.
     */
    apiKey: string;
    port: number;
    device: string;
    /** Stops the tunnel and the endpoint; resolves once the port is free. Safe to call twice. */
    close(): Promise<void>;
}
/**
 * Reads the code, has the app confirm every key's fingerprint, then saves the
 * configuration under `name` in the store (replacing any there). Nothing is
 * saved unless onFingerprint answers true. No network access.
 */
export declare function setup(code: string, opts: SetupOptions): Promise<SetupResult>;
/** Starts the tunnel and the loopback endpoint from the configuration in the store. */
export declare function open(opts: OpenOptions): Promise<Connection>;
/** Deletes the configuration from the store. The device's token still works until it is removed or replaced in the console. */
export declare function forget(opts: {
    store: SecretStore;
    name?: string;
}): Promise<void>;
/**
 * A SecretStore in memory, for tests and for apps that set up and open in
 * one run: nothing survives the process.
 */
export declare class MemorySecretStore implements SecretStore {
    #private;
    get(name: string): Promise<string | null>;
    set(name: string, value: string): Promise<void>;
    delete(name: string): Promise<void>;
}
