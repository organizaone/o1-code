/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { createRequire } from 'node:module';
import path from 'node:path';

type Handle = bigint | null;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
let native: ReturnType<typeof loadNative> | undefined;

function loadNative() {
  const koffi = createRequire(import.meta.url)(
    'koffi',
  ) as typeof import('koffi');
  const root = process.env['SystemRoot'] || 'C:\\Windows';
  if (!path.win32.isAbsolute(root))
    throw new Error('Invalid Windows SystemRoot');
  const load = (name: string) =>
    koffi.load(path.win32.join(root, 'System32', name));
  const user = load('user32.dll');
  const kernel = load('kernel32.dll');
  return {
    koffi,
    load,
    open: user.func('__stdcall', 'OpenClipboard', 'int', ['void *']) as (
      owner: null,
    ) => number,
    close: user.func('__stdcall', 'CloseClipboard', 'int', []) as () => number,
    available: user.func('__stdcall', 'IsClipboardFormatAvailable', 'int', [
      'uint32_t',
    ]) as (format: number) => number,
    get: user.func('__stdcall', 'GetClipboardData', 'void *', ['uint32_t']) as (
      format: number,
    ) => Handle,
    png: (
      user.func('__stdcall', 'RegisterClipboardFormatW', 'uint32_t', [
        'str16',
      ]) as (name: string) => number
    )('PNG'),
    size: kernel.func('__stdcall', 'GlobalSize', 'size_t', ['void *']) as (
      handle: Handle,
    ) => number | bigint,
    lock: kernel.func('__stdcall', 'GlobalLock', 'void *', ['void *']) as (
      handle: Handle,
    ) => Handle,
    unlock: kernel.func('__stdcall', 'GlobalUnlock', 'int', ['void *']) as (
      handle: Handle,
    ) => number,
  };
}

function api() {
  native ??= loadNative();
  if (!native.png) throw new Error('RegisterClipboardFormatW failed');
  return native;
}

function withClipboard<T>(read: (backend: ReturnType<typeof api>) => T): T {
  const backend = api();
  if (!backend.open(null)) throw new Error('OpenClipboard failed');
  let result: T;
  let closed: number;
  try {
    result = read(backend);
  } finally {
    closed = backend.close();
  }
  if (!closed) throw new Error('CloseClipboard failed');
  return result;
}

function copyGlobal(backend: ReturnType<typeof api>, handle: Handle): Buffer {
  if (!handle) throw new Error('GetClipboardData failed');
  const size = Number(backend.size(handle));
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES) {
    throw new Error('Clipboard allocation exceeds safe bounds');
  }
  const pointer = backend.lock(handle);
  if (!pointer) throw new Error('GlobalLock failed');
  try {
    const bytes = new Uint8Array(backend.koffi.view(pointer, size));
    if (bytes.length !== size)
      throw new Error('Incomplete clipboard allocation');
    return Buffer.from(bytes);
  } finally {
    // GlobalUnlock returns zero both on success and failure; the handle stays clipboard-owned.
    backend.unlock(handle);
  }
}

function checkDimensions(width: number, height: number) {
  if (width <= 0 || height <= 0 || width * height > MAX_PIXELS) {
    throw new Error('Clipboard image dimensions exceed safe bounds');
  }
}

function trimPng(bytes: Buffer): Buffer {
  if (
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('Malformed clipboard PNG');
  }
  checkDimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) break;
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IEND') {
      if (length !== 0) break;
      return bytes.subarray(0, end);
    }
    offset = end;
  }
  throw new Error('Malformed clipboard PNG chunks');
}

export function hasWindowsClipboardImage(): boolean {
  if (process.platform !== 'win32') return false;
  const backend = api();
  return Boolean(backend.available(backend.png) || backend.available(2));
}

export function getWindowsClipboardText(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  return withClipboard((backend) => {
    if (!backend.available(13)) return undefined;
    const bytes = copyGlobal(backend, backend.get(13));
    if (bytes.length % 2 !== 0)
      throw new Error('Malformed clipboard UTF-16 text');
    for (let offset = 0; offset < bytes.length; offset += 2) {
      if (bytes.readUInt16LE(offset) === 0)
        return bytes.toString('utf16le', 0, offset);
    }
    throw new Error('Unterminated clipboard UTF-16 text');
  });
}

export function getWindowsClipboardImage(): Buffer | null {
  if (process.platform !== 'win32') return null;
  return withClipboard((backend) => {
    let pngFailure: unknown;
    if (backend.available(backend.png)) {
      try {
        return trimPng(copyGlobal(backend, backend.get(backend.png)));
      } catch (error) {
        pngFailure = error;
      }
    }
    if (backend.available(2)) return bitmapToPng(backend, backend.get(2));
    if (pngFailure) throw pngFailure;
    return null;
  });
}

function bitmapToPng(backend: ReturnType<typeof api>, handle: Handle): Buffer {
  if (!handle) throw new Error('GetClipboardData failed');
  const { koffi } = backend;
  const gdi = backend.load('gdi32.dll');
  const bitmap = Buffer.alloc(koffi.sizeof('void *') === 8 ? 32 : 24);
  const getObject = gdi.func('__stdcall', 'GetObjectW', 'int', [
    'void *',
    'int',
    'void *',
  ]);
  if (getObject(handle, bitmap.length, bitmap) !== bitmap.length)
    throw new Error('GetObjectW failed');
  checkDimensions(bitmap.readInt32LE(4), bitmap.readInt32LE(8));
  const gdiplus = backend.load('gdiplus.dll');
  const ole = backend.load('ole32.dll');
  const input = koffi.struct({
    version: 'uint32_t',
    callback: 'void *',
    suppressThread: 'int',
    suppressCodecs: 'int',
  });
  const startup = gdiplus.func('__stdcall', 'GdiplusStartup', 'int', [
    '_Out_ uintptr_t *',
    koffi.pointer(input),
    'void *',
  ]);
  const shutdown = gdiplus.func('__stdcall', 'GdiplusShutdown', 'void', [
    'uintptr_t',
  ]);
  const create = gdiplus.func(
    '__stdcall',
    'GdipCreateBitmapFromHBITMAP',
    'int',
    ['void *', 'void *', '_Out_ void **'],
  );
  const dispose = gdiplus.func('__stdcall', 'GdipDisposeImage', 'int', [
    'void *',
  ]);
  const streamCreate = ole.func(
    '__stdcall',
    'CreateStreamOnHGlobal',
    'int32_t',
    ['void *', 'int', '_Out_ void **'],
  );
  const streamGlobal = ole.func(
    '__stdcall',
    'GetHGlobalFromStream',
    'int32_t',
    ['void *', '_Out_ void **'],
  );
  const save = gdiplus.func('__stdcall', 'GdipSaveImageToStream', 'int', [
    'void *',
    'void *',
    'void *',
    'void *',
  ]);
  const token: bigint[] = [0n];
  const image: Handle[] = [null];
  const stream: Handle[] = [null];
  const global: Handle[] = [null];
  const check = (status: number, operation: string) => {
    if (status !== 0) throw new Error(`${operation} failed (${status})`);
  };
  check(
    startup(
      token,
      { version: 1, callback: null, suppressThread: 0, suppressCodecs: 0 },
      null,
    ),
    'GdiplusStartup',
  );
  try {
    check(create(handle, null, image), 'GdipCreateBitmapFromHBITMAP');
    if (!image[0])
      throw new Error('GdipCreateBitmapFromHBITMAP returned no image');
    try {
      check(streamCreate(null, 1, stream), 'CreateStreamOnHGlobal');
      if (!stream[0])
        throw new Error('CreateStreamOnHGlobal returned no stream');
      try {
        const encoder = Buffer.from('06f47c55041ad3119a730000f81ef32e', 'hex');
        check(
          save(image[0], stream[0], encoder, null),
          'GdipSaveImageToStream',
        );
        check(streamGlobal(stream[0], global), 'GetHGlobalFromStream');
        return trimPng(copyGlobal(backend, global[0]));
      } finally {
        const vtable = koffi.decode(stream[0], 'void *');
        const release = koffi.decode(
          vtable,
          2 * koffi.sizeof('void *'),
          'void *',
        );
        koffi.call(
          release,
          koffi.proto('__stdcall', 'uint32_t', ['void *']),
          stream[0],
        );
      }
    } finally {
      dispose(image[0]);
    }
  } finally {
    shutdown(token[0]);
  }
}
