import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import type { HeatmapDocument, Level3 } from '../domain/series'
import { resolveThresholds, type ThresholdProfile } from '../domain/thresholds'
import * as deflate from './deflate'
import {
  CodecError,
  decodeDParameter,
  decodeDocument,
  encodeDParameter,
  encodeDocument,
  selectShareEncoding,
  type FormatId,
  type ShareMode,
} from './index'
import { compareShareEncodings } from './selection'

const MAX = Number.MAX_SAFE_INTEGER
const preset = (presetId: 0 | 1 | 2) => resolveThresholds({ method: 'preset', presetId }, [])
const exact = (
  counts: number[],
  thresholds = preset(1),
  startDate = '1970-01-01',
): HeatmapDocument => ({ source: { kind: 'exact', startDate, counts }, thresholds })
const compact = (document: HeatmapDocument): HeatmapDocument => ({
  source: {
    kind: 'levels',
    startDate: document.source.startDate,
    levels:
      document.source.kind === 'levels'
        ? document.source.levels
        : document.source.counts.map(
            (count) =>
              (count === 0
                ? 0
                : 1 + document.thresholds.boundaries.filter((b) => b <= count).length) as Level3,
          ),
  },
  thresholds: document.thresholds,
})
const formats = [0x21, 0x23, 0x25] as const
// Independent Node zlib 1.3.2.1 fixtures from manually specified raw bodies.
// pako 3.0.2 settings: level=6, windowBits=15, memLevel=8, strategy=0.
const golden = [
  {
    format: 0x21,
    document: {
      source: { kind: 'levels', startDate: '1970-01-01', levels: [0, 1, 2, 3, 4, 5, 6, 7] },
      thresholds: preset(1),
    } as HeatmapDocument,
    raw: [0, 1, 5, 57, 119],
    bytes: [33, 0, 0, 0, 0, 8, 99, 96, 100, 181, 44, 7, 0],
    d: 'IQAAAAAIY2BktSwHAA',
  },
  {
    format: 0x23,
    document: exact([0, 1, 2, 7], preset(0)),
    raw: [0, 0, 3, 5, 112],
    bytes: [35, 0, 0, 0, 0, 4, 99, 96, 96, 102, 45, 0, 0],
    d: 'IwAAAAAEY2BgZi0AAA',
  },
  {
    format: 0x25,
    document: exact([0, 127, 128, MAX, 0], preset(2)),
    raw: [0, 2, 0, 127, 128, 1, 255, 255, 255, 255, 255, 255, 255, 15, 0],
    bytes: [37, 0, 0, 0, 0, 5, 99, 96, 98, 168, 111, 96, 252, 15, 1, 252, 12, 0],
    d: 'JQAAAAAFY2BiqG9g_A8B_AwA',
  },
] as const

describe('圧縮Golden（pako 3.0.2、独立したNode zlibで検証）', () => {
  it.each(golden)('形式$format bytes / Base64URL', ({ format, document, raw, bytes, d }) => {
    const expected = Uint8Array.from(bytes)
    expect(encodeDocument(document, format)).toEqual(expected)
    expect(encodeDParameter(document, format)).toBe(d)
    expect(decodeDocument(expected)).toEqual(document)
    expect(decodeDParameter(d)).toEqual(document)
    expect(inflateRawSync(expected.subarray(6))).toEqual(Buffer.from(raw))
  })
})

const profiles: ThresholdProfile[] = [
  preset(0),
  preset(1),
  preset(2),
  { method: 'linear', boundaries: [] },
  { method: 'linear', boundaries: [2, MAX - 1, MAX] },
  { method: 'quantile', boundaries: [2, 7, 131] },
  { method: 'log', boundaries: [999, 1000] },
  { method: 'custom', boundaries: [2, 3, 4, 5, 6, MAX] },
]
function counts(length: number): number[] {
  let state = 123456789n
  return Array.from({ length }, (_, i) => {
    state = (state * 6364136223846793005n + 1442695040888963407n) % (1n << 53n)
    return i === length - 1 || i % 7 === 0 ? 0 : i % 5 === 0 ? MAX : Number(state)
  })
}
describe.each(formats)('圧縮形式%i', (format) => {
  describe.each([1, 2, 201, 3660])('%i日', (length) => {
    it.each(profiles)('$method / $boundaries: 閾値・レベル・件数の完全往復', (profile) => {
      const document = exact(length === 1 ? [MAX] : counts(length), profile, '1999-12-31')
      const before = structuredClone(document)
      const bytes = encodeDocument(document, format)
      expect(decodeDParameter(encodeDParameter(document, format))).toEqual(
        format === 0x21 ? compact(document) : document,
      )
      const plain = encodeDocument(document, (format - 1) as FormatId)
      expect(bytes.subarray(1, 6)).toEqual(plain.subarray(1, 6))
      expect(inflateRawSync(bytes.subarray(6))).toEqual(Buffer.from(plain.subarray(6)))
      expect(document).toEqual(before)
    })
  })

  it.each(['0001-01-01', '1969-12-31', '1999-12-31', '2000-02-28', '2024-02-28', '9999-12-29'])(
    '年境界・閏日・日付限界%s',
    (date) => {
      const document = exact([0, MAX, 0], preset(1), date)
      expect(decodeDocument(encodeDocument(document, format))).toEqual(
        format === 0x21 ? compact(document) : document,
      )
    },
  )
  it('全0と動的閾値の確定境界を再計算しない', () => {
    const document = exact([0, 0, 0], { method: 'quantile', boundaries: [2, 3, 4, 5, 6, 7] })
    expect(decodeDocument(encodeDocument(document, format))).toEqual(
      format === 0x21 ? compact(document) : document,
    )
  })
  it('ヘッダー検証を展開処理より先に行う', () => {
    const inflate = vi.spyOn(deflate, 'inflateBody')
    try {
      for (const header of [
        [format, 0, 0, 0, 0, 0],
        [format, 0, 0, 0, 14, 77],
        [format, 127, 255, 255, 0, 1],
      ]) {
        expect(() => decodeDocument(Uint8Array.of(...header, 7))).toThrow(CodecError)
      }
      expect(() => decodeDParameter('A'.repeat(65537))).toThrow(CodecError)
      expect(inflate).not.toHaveBeenCalled()
    } finally {
      inflate.mockRestore()
    }
  })
  it.each(
    [
      [255, 0, 0], // unknown threshold method
      [0, 255, 1, 0], // unknown preset
      [1, 1, 1, 0], // boundary below 2
      [1, 2, 2, 0, 0], // duplicate boundary
      [4, 0, 0], // custom requires six boundaries
      [0, 1, 0, 0], // extra raw payload / invalid bit width
    ].map((raw) => ({ raw })),
  )('展開後にも不正metadata・payloadを拒否する $raw', ({ raw }) => {
    const encoded = deflateRawSync(Uint8Array.from(raw))
    expect(() => decodeDocument(Uint8Array.of(format, 0, 0, 0, 0, 1, ...encoded))).toThrow(
      CodecError,
    )
  })
  it('全圧縮位置の切断と末尾余剰を拒否する', () => {
    const encoded = encodeDocument(exact([0, MAX, 0]), format)
    for (let length = 0; length < encoded.length; length++) {
      expect(() => decodeDocument(encoded.subarray(0, length))).toThrow(CodecError)
    }
    for (const tail of [[0], [255], [0, 255], [...encoded.subarray(6)]]) {
      expect(() => decodeDocument(Uint8Array.of(...encoded, ...tail))).toThrow(CodecError)
    }
  })
})

describe('最短候補をBase64URLの実文字数で選択', () => {
  const modeFormats = { compact: [0x20, 0x21], exact: [0x22, 0x23, 0x24, 0x25] } as const
  it.each(['compact', 'exact'] as const)('%sの全候補と公開戻り値を照合', (mode) => {
    for (const document of [
      exact([0]),
      exact(counts(201)),
      exact(Array<number>(3660).fill(0)),
      exact([MAX, ...Array<number>(3659).fill(0)]),
    ]) {
      const candidates = modeFormats[mode].map((format) => {
        const d = encodeDParameter(document, format)
        return { format, d, length: d.length }
      })
      const expected = [...candidates].sort(
        (a, b) => a.length - b.length || (a.format % 2) - (b.format % 2) || a.format - b.format,
      )[0]
      expect(selectShareEncoding(document, mode)).toEqual(expected)
      expect(selectShareEncoding(document, mode)).toEqual(selectShareEncoding(document, mode))
    }
  })
  it('短いデータは非圧縮、繰り返しは圧縮を選択する', () => {
    expect(selectShareEncoding(exact([0]), 'compact').format).toBe(0x20)
    expect(selectShareEncoding(exact([0]), 'exact').format).toBe(0x24)
    expect(selectShareEncoding(exact(Array<number>(3660).fill(0)), 'compact').format).toBe(0x21)
    expect(selectShareEncoding(exact(Array<number>(3660).fill(0)), 'exact').format).toBe(0x23)
  })
  it('bit packingとULEB128の分布差を実際の候補で比較する', () => {
    const dense = exact(Array.from({ length: 3660 }, (_, i) => i % 256))
    const sparse = exact([MAX, ...Array<number>(3659).fill(0)])
    expect(encodeDParameter(dense, 0x22).length).toBeLessThan(encodeDParameter(dense, 0x24).length)
    expect(encodeDParameter(sparse, 0x24).length).toBeLessThan(
      encodeDParameter(sparse, 0x22).length,
    )
    expect([0x24, 0x25]).toContain(selectShareEncoding(sparse, 'exact').format)
  })
  it('同じ実文字数の非圧縮bitとvarintではbit packingを優先する', () => {
    const document = exact([0, 0])
    expect(encodeDParameter(document, 0x22)).toHaveLength(encodeDParameter(document, 0x24).length)
    expect(selectShareEncoding(document, 'exact').format).toBe(0x22)
  })
  it('実際の圧縮・非圧縮が同長なら非圧縮を優先する', () => {
    const document = exact(Array<number>(6).fill(0), { method: 'linear', boundaries: [] })
    expect(encodeDParameter(document, 0x20)).toHaveLength(encodeDParameter(document, 0x21).length)
    expect(selectShareEncoding(document, 'compact').format).toBe(0x20)
  })
  it('同長時は非圧縮→bit packing→小さいIDの順（全形式対）', () => {
    const preference = [0x20, 0x22, 0x24, 0x21, 0x23, 0x25] as const
    const candidates = preference.map((format) => ({ format, d: 'AAAA', length: 4 }))
    expect([...candidates].reverse().sort(compareShareEncodings)).toEqual(candidates)
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        expect(compareShareEncodings(candidates[i]!, candidates[j]!)).toBeLessThan(0)
        expect(compareShareEncodings(candidates[j]!, candidates[i]!)).toBeGreaterThan(0)
      }
    }
  })
  it('LevelSeriesの段階・確定境界を維持し、完全共有を禁止する', () => {
    const document = compact(exact(counts(201), { method: 'quantile', boundaries: [2, 7, 131] }))
    const before = structuredClone(document)
    expect(decodeDParameter(selectShareEncoding(document, 'compact').d)).toEqual(document)
    expect(() => selectShareEncoding(document, 'exact')).toThrow(/正確な件数/)
    for (const format of [0x22, 0x23, 0x24, 0x25] as const) {
      expect(() => encodeDocument(document, format)).toThrow(CodecError)
    }
    expect(document).toEqual(before)
  })
  it('未知形式・未知モードを拒否する', () => {
    expect(() => encodeDocument(exact([0]), 0x26 as FormatId)).toThrow(CodecError)
    expect(() => selectShareEncoding(exact([0]), 'other' as ShareMode)).toThrow(CodecError)
  })
})
