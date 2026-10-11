// o1-connect-lib 9.9.0 - https://github.com/organizaone/o1-gateway (MIT)
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
 * - openRemote({ connection | baseUrl + apiKey, session, history }) puts a
 *   terminal session in remote mode (remote.ts, §5): the gateway mirrors what
 *   the app sends to the owner's browser and hands back its input and answers.
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
 | "port_unavailable"
/** The gateway refused the remote session before it opened; the `cause` is `{ status, code }` (the HTTP status, 0 for a `bye`, and the gateway's code or the bye's reason). */
 | "remote_refused"
/** The upgrade was answered by something that is not a remote session's gateway. */
 | "remote_protocol"
/** A decision was closed before a viewer answered it (in the terminal, by its expiry, or with the session). */
 | "decision_closed";
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
    /**
     * Whether this app names itself in the tunnel's outer requests
     * (`o1-connect-lib/<version>`, as the CLI's `identify` does); default false:
     * nothing about the client goes on the wire that a monitor can read.
     */
    identify?: boolean;
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
export type RemoteState = "online" | "reconnecting" | "ended";
export type RemoteDecisionKind = "can_use_tool" | "ask_user" | "plan";
export type RemoteCommandName = "interrupt" | "compact" | "clear" | "model" | "effort";
/** The terminal session going remote, as the gateway and a viewer name it. */
export interface RemoteSessionInfo {
    /** The session's own id: the same id re-opens the same remote session (and keeps a viewer's URL) within four hours. */
    id: string;
    /** Shown to the viewer (the host's name and a suffix, as a rule). */
    name: string;
    /** A hint of the working directory, for the viewer's list; never a secret. */
    cwd?: string;
    /** The terminal's version. */
    version: string;
    approvalMode: string;
    model: string;
}
export interface RemoteDecisionOption {
    value: string;
    label: string;
    danger?: boolean;
}
/** A question the terminal puts to its viewers too: a tool's permission, a question to the user, a plan. */
export interface RemoteDecisionRequest {
    id: string;
    kind: RemoteDecisionKind;
    /** ISO time; the gateway holds the request open at most an hour. */
    expiresAt: string;
    title: string;
    summary: string;
    options: RemoteDecisionOption[];
}
export interface RemoteDecision {
    outcome: string;
    payload?: unknown;
    by: "remote";
}
export interface RemoteAgentEvents {
    /** A viewer typed a prompt: for the terminal's own queue. */
    input: {
        id: string;
        text: string;
    };
    /** A viewer ran one of the commands allowed remotely. */
    command: {
        id: string;
        name: RemoteCommandName;
        args?: Record<string, unknown>;
    };
    /** A viewer answered a decision (requestDecision's promise resolves with it too). */
    decision: {
        id: string;
        outcome: string;
        payload?: unknown;
    };
    viewer: {
        op: "attached" | "detached";
        count: number;
    };
    /** online after a reconnection, reconnecting while the gateway is away, ended with why (a `bye`'s reason, or `closed`). */
    state: {
        state: RemoteState;
        reason?: string;
    };
    /** The gateway refused one of this side's frames (`code`, and the frame's `id` when it had one). */
    error: {
        code: string;
        id?: string;
    };
}
export interface RemoteOpenOptions {
    /** The gateway's base URL (https; http for a loopback host in tests), with `apiKey`. */
    baseUrl?: string;
    /** Or an open() connection: the session rides its pinned tunnel with its device key. */
    connection?: Connection;
    /** The device key, with `baseUrl`. */
    apiKey?: string;
    session: RemoteSessionInfo;
    /** The session's recent events, for a viewer's first screen (the newest that fit 512 KiB); a function is read at every hello. */
    history?: unknown[] | (() => unknown[]);
    /** Lines without content (ids, counts, reasons); default: none. */
    log?(line: string): void;
}
export interface RemoteAgent {
    readonly remoteId: string;
    /** Where a viewer opens the session (the account page). */
    readonly url: string;
    readonly state: RemoteState;
    /** One event of the session, as the terminal shows it (opaque to the gateway). */
    send(ev: unknown): void;
    status(s: {
        state: "idle" | "streaming" | "awaiting";
        model?: string;
        approvalMode?: string;
    }): void;
    /** Asks the viewers; resolves with the first viewer's answer, rejects `decision_closed` once closeDecision runs (the terminal answered first) or the session ends. */
    requestDecision(req: RemoteDecisionRequest): Promise<RemoteDecision>;
    /** The request is no longer open: answered in the terminal (`local`), by a viewer (`remote`, after the promise resolved), or expired. */
    closeDecision(id: string, by: "local" | "remote" | "expired", outcome?: string | null): void;
    /** Subscribes; the function returned unsubscribes. */
    on<K extends keyof RemoteAgentEvents>(event: K, fn: (e: RemoteAgentEvents[K]) => void): () => void;
    /** Leaves remote mode: the gateway ends the session at once and tells the viewers. Safe to call twice. */
    close(): Promise<void>;
}
/**
 * Puts a terminal session in remote mode: an outbound connection to the
 * gateway's `/remote/agent` (through `connection`'s tunnel, or straight to
 * `baseUrl` with `apiKey`), the session's hello, and the gateway's ready.
 * Resolves once viewers may attach; rejects `remote_refused` when the
 * gateway will not have it (the key, the plan, a ceiling), with why in the
 * `cause`. The agent reconnects on its own and ends only on a refusal it
 * cannot mend or on close().
 */
export declare function openRemote(opts: RemoteOpenOptions): Promise<RemoteAgent>;
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
