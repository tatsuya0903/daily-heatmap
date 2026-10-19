import { deflateRawSync, deflateSync, gzipSync, inflateRawSync, constants } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import * as pako from 'pako'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deflateBody, inflateBody } from './deflate'
import { CodecError } from './errors'
import { MAX_BODY_BYTES } from './limits'

// Native ESM namespaces cannot be spied on. Wrap only the three low-level
// entry points; default implementations remain the real pako implementation.
vi.mock('pako', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pako')>()
  return {
    ...actual,
    zlibInflate: vi.fn<typeof actual.zlibInflate>(actual.zlibInflate),
    zlibInflateEnd: vi.fn<typeof actual.zlibInflateEnd>(actual.zlibInflateEnd),
    zlibInflateInit2: vi.fn<typeof actual.zlibInflateInit2>(actual.zlibInflateInit2),
  }
})
const actualPako = await vi.importActual<typeof import('pako')>('pako')
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(pako.zlibInflate).mockImplementation(actualPako.zlibInflate)
  vi.mocked(pako.zlibInflateEnd).mockImplementation(actualPako.zlibInflateEnd)
  vi.mocked(pako.zlibInflateInit2).mockImplementation(actualPako.zlibInflateInit2)
})
const sample = Uint8Array.from({ length: 3660 }, (_, i) => (i * 37 + (i % 19)) % 256)
const raw = deflateRawSync(sample)
const invalidStored = Uint8Array.of(1, 1, 0, 0, 0, 65)

describe('事前検証24ケースからの安全なraw DEFLATE回帰', () => {
  it('一括圧縮を独立したNode zlibで展開でき、逆方向も一致する', () => {
    expect(inflateRawSync(deflateBody(sample))).toEqual(Buffer.from(sample))
    expect(inflateBody(raw)).toEqual(sample)
    expect(inflateBody(deflateBody(sample))).toEqual(sample)
  })

  it.each([
    ['gzip', gzipSync(sample)],
    ['zlib', deflateSync(sample)],
    ['empty', new Uint8Array()],
    ['reserved BTYPE', Uint8Array.of(7)],
    ['invalid LEN/NLEN', invalidStored],
    ['invalid then valid', Uint8Array.of(...invalidStored, ...raw)],
    ['reserved then valid', Uint8Array.of(7, ...raw)],
    ['invalid Huffman tree', Uint8Array.of(5, 0, 0, 0)],
    ['back-reference before output', Uint8Array.of(3, 2, 0)],
  ] as const)('%sを拒否しCodecErrorで通知する', (_, bytes) => {
    expect(() => inflateBody(bytes)).toThrow(CodecError)
  })

  it.each([
    ['00', [0]],
    ['ff', [255]],
    ['00 ff', [0, 255]],
    ['別の有効ストリーム', [...raw]],
  ] as const)('ストリーム後の%sを拒否する', (_, tail) => {
    expect(() => inflateBody(Uint8Array.of(...raw, ...tail))).toThrow(/余剰/)
  })

  it.each([
    ['stored', { level: 0 }],
    ['fixed', { strategy: constants.Z_FIXED }],
    ['dynamic', { level: 6 }],
  ] as const)('%sの全切断prefixを拒否し、完全なストリームだけを受理する', (_, options) => {
    const bytes = deflateRawSync(sample, options)
    expect(inflateBody(bytes)).toEqual(sample)
    for (let length = 0; length < bytes.length; length++) {
      expect(() => inflateBody(bytes.subarray(0, length))).toThrow(CodecError)
    }
  })

  it('DEFLATE最終バイトの未使用6bitは許容し、その後の1バイトは拒否する', () => {
    expect(inflateBody(Uint8Array.of(3, 0))).toEqual(new Uint8Array())
    expect(inflateBody(Uint8Array.of(3, 252))).toEqual(new Uint8Array())
    expect(() => inflateBody(Uint8Array.of(3, 252, 0))).toThrow(/余剰/)
    expect(() => inflateBody(Uint8Array.of(3, 252, 255))).toThrow(/余剰/)
  })

  it.each([
    ['stored', { level: 0 }],
    ['fixed', { strategy: constants.Z_FIXED }],
    ['dynamic', { level: 6 }],
  ] as const)('%s: 40KiBちょうどを受理し、1バイト超過を拒否する', (_, options) => {
    const exact = new Uint8Array(MAX_BODY_BYTES)
    expect(inflateBody(deflateRawSync(exact, options))).toEqual(exact)
    expect(() => inflateBody(deflateRawSync(new Uint8Array(MAX_BODY_BYTES + 1), options))).toThrow(
      /40KiB/,
    )
    const encoded = deflateRawSync(exact, options)
    expect(() => inflateBody(Uint8Array.of(...encoded, 0))).toThrow(/余剰/)
  })

  it('最後の入力を消費してもZ_STREAM_ENDでなければ拒否する', () => {
    const original = actualPako.zlibInflate
    let status: number | undefined
    let consumed = 0
    let output = 0
    vi.mocked(pako.zlibInflate).mockImplementation((stream, flush) => {
      const result = original(stream, flush)
      status = result
      consumed = stream.next_in
      output = stream.next_out
      return result
    })
    const compressed = deflateRawSync(new Uint8Array(MAX_BODY_BYTES + 1))
    expect(() => inflateBody(compressed)).toThrow(CodecError)
    expect(status).toBe(pako.Z_BUF_ERROR)
    expect(consumed).toBe(compressed.length)
    expect(output).toBe(MAX_BODY_BYTES)
  })

  it('高圧縮率の8MiBでも、40KiB出力・入力54バイトで停止し完全展開しない', () => {
    const original = actualPako.zlibInflate
    const states: { input: number; output: number; capacity: number; available: number }[] = []
    vi.mocked(pako.zlibInflate).mockImplementation((stream, flush) => {
      const capacity = stream.output.byteLength
      const result = original(stream, flush)
      states.push({
        input: stream.next_in,
        output: stream.next_out,
        capacity,
        available: stream.avail_out,
      })
      return result
    })
    const cleanup = vi.mocked(pako.zlibInflateEnd)
    const compressed = deflateRawSync(new Uint8Array(8 * 1024 * 1024))
    expect(compressed.length).toBe(8157)
    expect(() => inflateBody(compressed)).toThrow(/40KiB/)
    expect(states).toEqual([
      { input: 54, output: MAX_BODY_BYTES, capacity: MAX_BODY_BYTES, available: 0 },
    ])
    expect(cleanup).toHaveBeenCalledOnce()
    expect(cleanup.mock.calls[0]![0].state).toBeNull()
  })

  it('事前検証の割当計装: pako自体も過大出力バッファを確保しない', () => {
    const allocations: number[] = []
    const context = {
      exports: {} as typeof import('pako'),
      Uint8Array: new Proxy(Uint8Array, {
        construct(target, args: ConstructorParameters<typeof Uint8Array>) {
          const array = Reflect.construct(target, args) as Uint8Array
          allocations.push(array.byteLength)
          return array
        },
      }),
    }
    const require = createRequire(import.meta.url)
    runInNewContext(readFileSync(require.resolve('pako'), 'utf8'), context)
    allocations.length = 0
    const p = context.exports
    const stream = new p.ZStream()
    const input = deflateRawSync(new Uint8Array(8 * 1024 * 1024))
    p.zlibInflateInit2(stream, -15)
    stream.input = input
    stream.avail_in = input.length
    stream.output = new Uint8Array(MAX_BODY_BYTES)
    stream.avail_out = MAX_BODY_BYTES
    try {
      expect(p.zlibInflate(stream, p.Z_FINISH)).toBe(p.Z_BUF_ERROR)
      expect(stream.next_out).toBe(MAX_BODY_BYTES)
      expect(stream.next_in).toBe(54)
      expect(Math.max(...allocations)).toBe(32768)
    } finally {
      p.zlibInflateEnd(stream)
    }
  })

  it.each([
    ['正常終了', raw],
    ['切断', raw.subarray(0, -1)],
    ['不正ブロック', invalidStored],
    ['余剰バイト', Uint8Array.of(...raw, 0)],
  ] as const)('%sでも低水準リソースを必ず解放する', (_, input) => {
    const cleanup = vi.mocked(pako.zlibInflateEnd)
    let failure: unknown
    try {
      inflateBody(input)
    } catch (error) {
      failure = error
    }
    expect(failure === undefined || failure instanceof CodecError).toBe(true)
    expect(cleanup).toHaveBeenCalledOnce()
    expect(cleanup.mock.calls[0]![0].state).toBeNull()
  })

  it('進捗のないZ_OKでもリトライせず終了する', () => {
    const inflate = vi.mocked(pako.zlibInflate).mockReturnValue(pako.Z_OK)
    const cleanup = vi.mocked(pako.zlibInflateEnd)
    expect(() => inflateBody(raw)).toThrow(CodecError)
    expect(inflate).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('低水準APIの例外もCodecErrorへ変換し、リソースを解放する', () => {
    vi.mocked(pako.zlibInflate).mockImplementation(() => {
      throw new Error('diagnostic')
    })
    const cleanup = vi.mocked(pako.zlibInflateEnd)
    expect(() => inflateBody(raw)).toThrow(CodecError)
    expect(cleanup).toHaveBeenCalledOnce()
    expect(cleanup.mock.calls[0]![0].state).toBeNull()
  })

  it('初期化の失敗でも後処理する', () => {
    vi.mocked(pako.zlibInflateInit2).mockReturnValue(pako.Z_STREAM_ERROR)
    const cleanup = vi.mocked(pako.zlibInflateEnd)
    expect(() => inflateBody(raw)).toThrow(CodecError)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('圧縮前40KiB上限と圧縮入力上限を、処理前に検証する', () => {
    const initialize = vi.mocked(pako.zlibInflateInit2)
    expect(() => inflateBody(new Uint8Array(49_147))).toThrow(CodecError)
    expect(initialize).not.toHaveBeenCalled()
    expect(() => deflateBody(new Uint8Array(MAX_BODY_BYTES + 1))).toThrow(CodecError)
  })
})
