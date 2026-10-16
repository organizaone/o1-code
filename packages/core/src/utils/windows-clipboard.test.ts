/**
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  functions: {} as Record<string, ReturnType<typeof vi.fn>>,
  load: vi.fn(),
  decode: vi.fn(),
  call: vi.fn(),
}));
vi.mock('node:module', () => ({
  createRequire: () => () => ({
    load: native.load,
    decode: native.decode,
    call: native.call,
    view: (pointer: unknown, length: number) => {
      const bytes = native.decode(pointer, 'uint8_t', length) as Buffer;
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
    },
    proto: vi.fn(() => 'release'),
    sizeof: vi.fn(() => 8),
    struct: vi.fn((fields: unknown) => fields),
    pointer: vi.fn((type: unknown) => type),
  }),
}));

function png(width = 1, height = 1): Buffer {
  const result = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xkAAAAASUVORK5CYII=',
    'base64',
  );
  result.writeUInt32BE(width, 16);
  result.writeUInt32BE(height, 20);
  return result;
}

async function helper() {
  return import('./windows-clipboard.js');
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('process', { ...process, platform: 'win32' });
  native.load.mockReset().mockImplementation(() => ({
    func: (_convention: string, name: string) =>
      (native.functions[name] ??= vi.fn()),
  }));
  native.functions = {};
  for (const name of ['OpenClipboard', 'CloseClipboard', 'GlobalUnlock']) {
    native.functions[name] = vi.fn(() => 1);
  }
  native.functions['RegisterClipboardFormatW'] = vi.fn(() => 100);
  native.functions['IsClipboardFormatAvailable'] = vi.fn(() => 0);
  native.functions['GetClipboardData'] = vi.fn(() => 10n);
  native.functions['GlobalSize'] = vi.fn(() => png().length);
  native.functions['GlobalLock'] = vi.fn(() => 20n);
  for (const name of [
    'GdiplusShutdown',
    'GdipDisposeImage',
    'GetObjectW',
    'GdiplusStartup',
    'GdipCreateBitmapFromHBITMAP',
    'CreateStreamOnHGlobal',
    'GdipSaveImageToStream',
    'GetHGlobalFromStream',
  ]) {
    native.functions[name] = vi.fn(() => 0);
  }
  native.decode.mockReset().mockImplementation(() => png());
  native.call.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('Windows clipboard', () => {
  it('does not load Windows libraries on other platforms', async () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    const api = await helper();
    expect(api.hasWindowsClipboardImage()).toBe(false);
    expect(api.getWindowsClipboardImage()).toBeNull();
    expect(api.getWindowsClipboardText()).toBeUndefined();
    expect(native.load).not.toHaveBeenCalled();
  });

  it('reports an empty clipboard without hiding backend failures', async () => {
    const api = await helper();
    expect(api.hasWindowsClipboardImage()).toBe(false);
    expect(api.getWindowsClipboardImage()).toBeNull();
    expect(api.getWindowsClipboardText()).toBeUndefined();
    native.functions['OpenClipboard'].mockReturnValue(0);
    expect(() => api.getWindowsClipboardImage()).toThrow('OpenClipboard');
  });

  it('propagates library load failures', async () => {
    native.load.mockImplementation(() => {
      throw new Error('backend unavailable');
    });
    const api = await helper();
    expect(() => api.hasWindowsClipboardImage()).toThrow('backend unavailable');
  });

  it('detects PNG and bitmap formats', async () => {
    const api = await helper();
    native.functions['IsClipboardFormatAvailable'].mockImplementation(
      (format: number) => Number(format === 2),
    );
    expect(api.hasWindowsClipboardImage()).toBe(true);
  });

  it('copies PNG bytes through IEND and closes clipboard ownership', async () => {
    const api = await helper();
    native.functions['IsClipboardFormatAvailable'].mockReturnValue(1);
    native.functions['GlobalSize'].mockReturnValue(png().length + 10);
    const memory = Buffer.concat([png(), Buffer.alloc(10, 42)]);
    native.decode.mockReturnValue(memory);
    const result = api.getWindowsClipboardImage();
    expect(result).toEqual(png());
    memory.fill(0);
    expect(result).toEqual(png());
    expect(native.functions['GlobalUnlock']).toHaveBeenCalledWith(10n);
    expect(native.functions['CloseClipboard']).toHaveBeenCalledOnce();
    for (const [dll] of native.load.mock.calls) {
      expect(dll).toMatch(/^[A-Za-z]:\\.*\\System32\\[^\\]+\.dll$/);
    }
  });

  it.each([0, 64 * 1024 * 1024 + 1])(
    'rejects unsafe global allocation size %s',
    async (size) => {
      const api = await helper();
      native.functions['IsClipboardFormatAvailable'].mockImplementation(
        (format: number) => Number(format === 100),
      );
      native.functions['GlobalSize'].mockReturnValue(size);
      expect(() => api.getWindowsClipboardImage()).toThrow();
      expect(native.functions['GlobalLock']).not.toHaveBeenCalled();
      expect(native.functions['CloseClipboard']).toHaveBeenCalledOnce();
    },
  );

  it.each([Buffer.alloc(45), png(100_000, 100_000), png().subarray(0, 38)])(
    'rejects malformed or oversized PNG data',
    async (bytes) => {
      const api = await helper();
      native.functions['IsClipboardFormatAvailable'].mockImplementation(
        (format: number) => Number(format === 100),
      );
      native.functions['GlobalSize'].mockReturnValue(bytes.length);
      native.decode.mockReturnValue(bytes);
      expect(() => api.getWindowsClipboardImage()).toThrow();
      expect(native.functions['GlobalUnlock']).toHaveBeenCalledOnce();
      expect(native.functions['CloseClipboard']).toHaveBeenCalledOnce();
    },
  );

  it('closes the clipboard when GlobalLock fails', async () => {
    const api = await helper();
    native.functions['IsClipboardFormatAvailable'].mockReturnValue(1);
    native.functions['GlobalLock'].mockReturnValue(null);
    expect(() => api.getWindowsClipboardText()).toThrow('GlobalLock');
    expect(native.functions['GlobalUnlock']).not.toHaveBeenCalled();
    expect(native.functions['CloseClipboard']).toHaveBeenCalledOnce();
  });

  it('reads bounded UTF-16 text through the first terminator', async () => {
    const api = await helper();
    const bytes = Buffer.from('hello\0unused', 'utf16le');
    native.functions['IsClipboardFormatAvailable'].mockReturnValue(1);
    native.functions['GlobalSize'].mockReturnValue(bytes.length);
    native.decode.mockReturnValue(bytes);
    expect(api.getWindowsClipboardText()).toBe('hello');
    expect(native.functions['GlobalUnlock']).toHaveBeenCalledOnce();
  });

  it.each([
    'success',
    'GdipSaveImageToStream',
    'CreateStreamOnHGlobal',
    'GdipCreateBitmapFromHBITMAP',
    'GdiplusStartup',
    'malformed PNG',
  ])('cleans up owned bitmap resources after %s', async (scenario) => {
    const api = await helper();
    native.functions['IsClipboardFormatAvailable'].mockImplementation(
      (format: number) => Number(format === 2),
    );
    native.functions['GetObjectW'].mockImplementation(
      (_handle: unknown, size: number, data: Buffer) => {
        data.writeInt32LE(2, 4);
        data.writeInt32LE(2, 8);
        return size;
      },
    );
    native.functions['GdiplusStartup'].mockImplementation((token: bigint[]) => {
      token[0] = 30n;
      return 0;
    });
    native.functions['GdipCreateBitmapFromHBITMAP'].mockImplementation(
      (_handle: unknown, _palette: unknown, output: bigint[]) => {
        output[0] = 40n;
        return 0;
      },
    );
    native.functions['CreateStreamOnHGlobal'].mockImplementation(
      (_handle: unknown, _free: unknown, output: bigint[]) => {
        output[0] = 50n;
        return 0;
      },
    );
    native.functions['GetHGlobalFromStream'].mockImplementation(
      (_stream: unknown, output: bigint[]) => {
        output[0] = 60n;
        return 0;
      },
    );
    if (scenario.startsWith('Gdip') || scenario === 'CreateStreamOnHGlobal') {
      native.functions[scenario].mockImplementation(() => 1);
    }
    native.decode.mockImplementation((_pointer: unknown, type: string) =>
      type === 'void *' ? 70n : png(),
    );
    if (scenario === 'malformed PNG') {
      native.functions['IsClipboardFormatAvailable'].mockReturnValue(1);
      native.decode.mockReturnValueOnce(Buffer.alloc(png().length));
    }
    const failed =
      scenario.startsWith('Gdip') || scenario === 'CreateStreamOnHGlobal';
    if (failed) expect(() => api.getWindowsClipboardImage()).toThrow(scenario);
    else expect(api.getWindowsClipboardImage()).toEqual(png());
    const createdBitmap = ![
      'GdiplusStartup',
      'GdipCreateBitmapFromHBITMAP',
    ].includes(scenario);
    const createdStream = createdBitmap && scenario !== 'CreateStreamOnHGlobal';
    expect(native.call).toHaveBeenCalledTimes(Number(createdStream));
    expect(native.functions['GdipDisposeImage']).toHaveBeenCalledTimes(
      Number(createdBitmap),
    );
    expect(native.functions['GdiplusShutdown']).toHaveBeenCalledTimes(
      Number(scenario !== 'GdiplusStartup'),
    );
    expect(native.functions['CloseClipboard']).toHaveBeenCalledOnce();
  });

  it('rejects oversized bitmaps before starting GDI+', async () => {
    const api = await helper();
    native.functions['IsClipboardFormatAvailable'].mockImplementation(
      (format: number) => Number(format === 2),
    );
    native.functions['GetObjectW'].mockImplementation(
      (_handle: unknown, size: number, data: Buffer) => {
        data.writeInt32LE(100_000, 4);
        data.writeInt32LE(100_000, 8);
        return size;
      },
    );
    expect(() => api.getWindowsClipboardImage()).toThrow('dimensions');
    expect(native.functions['GdiplusStartup']).not.toHaveBeenCalled();
    expect(native.functions['CloseClipboard']).toHaveBeenCalledOnce();
  });
});
