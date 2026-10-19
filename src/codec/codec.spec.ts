import { describe, expect, it } from 'vitest'
import type { HeatmapDocument, Level3 } from '../domain/series'
import { PRESETS, resolveThresholds, type ThresholdProfile } from '../domain/thresholds'
import {
  CodecError,
  decodeDParameter,
  decodeDocument,
  encodeDParameter,
  encodeDocument,
  FORMAT_IDS,
  MAX_BODY_BYTES,
  type UncompressedFormatId,
} from './index'

const MAX = Number.MAX_SAFE_INTEGER
const FORMATS = [FORMAT_IDS.compact, FORMAT_IDS.exactBits, FORMAT_IDS.exactVarint] as const
const preset = (id: 0 | 1 | 2): ThresholdProfile =>
  resolveThresholds({ method: 'preset', presetId: id }, [])
const exact = (
  counts: number[],
  thresholds = preset(1),
  startDate = '1970-01-01',
): HeatmapDocument => ({
  source: { kind: 'exact', startDate, counts },
  thresholds,
})
const levels = (
  values: Level3[],
  thresholds = preset(1),
  startDate = '1970-01-01',
): HeatmapDocument => ({
  source: { kind: 'levels', startDate, levels: values },
  thresholds,
})

// ヘッダーはepoch day 0、metadataとpayloadは各テストでバイトを直接指定する。
function wire(format: number, days: number, body: number[]): Uint8Array {
  return Uint8Array.of(format, 0, 0, 0, Math.floor(days / 256), days % 256, ...body)
}

function compactVersion(document: HeatmapDocument): HeatmapDocument {
  if (document.source.kind === 'levels') return document
  return {
    source: {
      kind: 'levels',
      startDate: document.source.startDate,
      levels: document.source.counts.map((count) =>
        count === 0
          ? 0
          : ((1 + document.thresholds.boundaries.filter((b) => b <= count).length) as Level3),
      ),
    },
    thresholds: document.thresholds,
  }
}

// Encoderに依存せず、SPECのヘッダー・3bit連結・差分・ULEB128から手計算した固定値。
// Base64URLはこのバイト列を6bitずつalphabetへ対応させたもの。
const golden = [
  {
    name: 'compact 8日、全レベル 000001010011100101110111',
    format: FORMAT_IDS.compact,
    document: levels([0, 1, 2, 3, 4, 5, 6, 7]),
    bytes: [0x20, 0, 0, 0, 0, 8, 0, 1, 0x05, 0x39, 0x77],
    d: 'IAAAAAAIAAEFOXc',
  },
  {
    name: 'compact 1日、111 + 00000 padding',
    format: FORMAT_IDS.compact,
    document: levels([7]),
    bytes: [0x20, 0, 0, 0, 0, 1, 0, 1, 0xe0],
    d: 'IAAAAAABAAHg',
  },
  {
    name: 'compact 2日、負epoch、001111 + 00 padding',
    format: FORMAT_IDS.compact,
    document: levels([1, 7], preset(2), '1969-12-31'),
    bytes: [0x20, 0xff, 0xff, 0xff, 0, 2, 0, 2, 0x3c],
    d: 'IP___wACAAI8',
  },
  {
    name: 'exact bits、幅3、000001010111 + 0000 padding',
    format: FORMAT_IDS.exactBits,
    document: exact([0, 1, 2, 7], preset(0)),
    bytes: [0x22, 0, 0, 0, 0, 4, 0, 0, 3, 0x05, 0x70],
    d: 'IgAAAAAEAAADBXA',
  },
  {
    name: 'exact varint、MAX=7個のff + 0f、末尾0',
    format: FORMAT_IDS.exactVarint,
    document: exact([0, 127, 128, MAX, 0], preset(2)),
    bytes: [0x24, 0, 0, 0, 0, 5, 0, 2, 0, 127, 128, 1, 255, 255, 255, 255, 255, 255, 255, 15, 0],
    d: 'JAAAAAAFAAIAf4AB_________w8A',
  },
  {
    name: 'linear metadata: [2,130,131]の差分は[2,128,1]',
    format: FORMAT_IDS.exactVarint,
    document: exact([0], { method: 'linear', boundaries: [2, 130, 131] }),
    bytes: [0x24, 0, 0, 0, 0, 1, 1, 3, 2, 128, 1, 1, 0],
    d: 'JAAAAAABAQMCgAEBAA',
  },
] as const

describe('V4 Golden bytes / Base64URL', () => {
  it.each(golden)('$name', ({ format, document, bytes, d }) => {
    const expected = Uint8Array.from(bytes)
    expect(encodeDocument(document, format)).toEqual(expected)
    expect(encodeDParameter(document, format)).toBe(d)
    expect(decodeDocument(expected)).toEqual(document)
    expect(decodeDParameter(d)).toEqual(document)
  })

  it('201日、preset ID1 = 84バイト / 112文字（SPEC 5.3）', () => {
    // 20 000000 00c9 0001 に76個の00を連結。
    // 6bit groupingの先頭12文字はIAAAAADJAAEA、残り100文字はA。
    const document = levels(Array<Level3>(201).fill(0))
    const expected = new Uint8Array(84)
    expected.set([0x20, 0, 0, 0, 0, 201, 0, 1])
    const d = 'IAAAAADJAAEA' + 'A'.repeat(100)
    expect(encodeDocument(document, 0x20)).toEqual(expected)
    expect(encodeDParameter(document, 0x20)).toBe(d)
    expect(d).toHaveLength(112)
    expect(decodeDParameter(d)).toEqual(document)
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

// 新規依存を追加せず、53bit整数の決定的LCGで合成データだけを生成する。
function sampleCounts(length: number): number[] {
  let state = 0x123456789abcn
  return Array.from({ length }, (_, index) => {
    state = (state * 6_364_136_223_846_793_005n + 1_442_695_040_888_963_407n) % (1n << 53n)
    if (index === length - 1 || index % 7 === 0) return 0
    if (index % 5 === 0 || length === 2) return MAX
    return Number(state)
  })
}

describe.each(FORMATS)('非圧縮形式 %i', (format) => {
  describe.each([1, 2, 201, 3660])('%i日', (dayCount) => {
    it.each(profiles)('全5方式・preset $presetId / $method / $boundaries', (thresholds) => {
      const counts = dayCount === 1 ? [MAX] : sampleCounts(dayCount)
      const document = exact(counts, thresholds, '1999-12-31')
      const before = JSON.stringify(document)
      const expected = format === FORMAT_IDS.compact ? compactVersion(document) : document
      const bytes = encodeDocument(document, format)
      expect(decodeDocument(bytes)).toEqual(expected)
      expect(decodeDParameter(encodeDParameter(document, format))).toEqual(expected)
      expect(JSON.stringify(document)).toBe(before)
      expect(bytes.length - 6).toBeLessThanOrEqual(MAX_BODY_BYTES)
    })
  })

  it.each([
    ['0001-01-01', 2],
    ['0001-12-31', 2],
    ['0099-12-31', 2],
    ['0100-12-31', 2],
    ['1969-12-31', 2],
    ['1999-12-31', 2],
    ['2000-02-28', 3],
    ['2024-02-28', 3],
    ['9999-12-30', 2],
    ['9999-12-31', 1],
  ] as const)('日付境界 %s / %i日', (startDate, count) => {
    const document = exact(Array<number>(count).fill(0), preset(1), startDate)
    const expected = format === FORMAT_IDS.compact ? compactVersion(document) : document
    expect(decodeDParameter(encodeDParameter(document, format))).toEqual(expected)
  })

  it('確定境界を再計算しない（同一件数でも複数の既存境界を保持）', () => {
    const document = exact([0, 10, 10, 10, 0], {
      method: 'quantile',
      boundaries: [2, 3, 4, 5, 6, 7],
    })
    const expected = format === FORMAT_IDS.compact ? compactVersion(document) : document
    expect(decodeDocument(encodeDocument(document, format))).toEqual(expected)
    expect(expected.thresholds.boundaries).toEqual([2, 3, 4, 5, 6, 7])
  })

  it.each([-1, 1.25, NaN, Infinity, MAX + 1])('不正な件数 %s を拒否', (value) => {
    expect(() => encodeDocument(exact([value]), format)).toThrow(CodecError)
  })

  it.each([0, 3661])('不正な日数%iを拒否', (days) => {
    expect(() => encodeDocument(exact(Array<number>(days).fill(0)), format)).toThrow(CodecError)
  })

  it('開始日・終了日を検証', () => {
    expect(() => encodeDocument(exact([0], preset(1), '0000-01-01'), format)).toThrow(CodecError)
    expect(() => encodeDocument(exact([0, 0], preset(1), '9999-12-31'), format)).toThrow(CodecError)
  })
})

describe('完全データとcompactの責務', () => {
  it.each([FORMAT_IDS.exactBits, FORMAT_IDS.exactVarint])(
    'compactから形式%iの件数を復元しない',
    (format) => {
      const restored = decodeDParameter('IAAAAAABAAHg')
      expect(restored.source.kind).toBe('levels')
      expect(restored.source).not.toHaveProperty('counts')
      expect(() => encodeDocument(restored, format)).toThrow(/正確な件数/)
    },
  )

  it('exactを変更せず、確定済みpreset境界で分類する', () => {
    const document = exact([0, 1, 49, 50, 99, 100, 299, 300, 499, 500, 699, 700, 999, 1000, MAX, 0])
    const before = structuredClone(document)
    expect(decodeDocument(encodeDocument(document, 0x20)).source).toEqual({
      kind: 'levels',
      startDate: '1970-01-01',
      levels: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 0],
    })
    expect(document).toEqual(before)
  })

  it.each([0, 1, 2, 3, 4, 5, 6])('境界数%iに対応する有効レベルだけを受理', (count) => {
    const profile: ThresholdProfile = {
      method: 'linear',
      boundaries: [2, 3, 4, 5, 6, 7].slice(0, count),
    }
    const values = Array.from({ length: 201 }, (_, index) => (index % (count + 2)) as Level3)
    const document = levels(values, profile)
    expect(decodeDocument(encodeDocument(document, 0x20))).toEqual(document)
    expect(encodeDocument(document, 0x20)).toEqual(
      encodeDocument(decodeDocument(encodeDocument(document, 0x20)), 0x20),
    )
  })

  it.each([0, 1, 2, 3, 4, 5])('境界数%iに対する未使用レベルを拒否', (count) => {
    const profile: ThresholdProfile = {
      method: 'linear',
      boundaries: [2, 3, 4, 5, 6, 7].slice(0, count),
    }
    const invalid = (count + 2) as Level3
    expect(() => encodeDocument(levels([invalid], profile), 0x20)).toThrow(CodecError)
    expect(() =>
      decodeDocument(
        wire(0x20, 1, [
          1,
          count,
          ...profile.boundaries.map((b, i) => (i === 0 ? b : 1)),
          invalid * 32,
        ]),
      ),
    ).toThrow(CodecError)
  })

  describe.each([1, 2, 201, 3660])('compact由来%i日', (count) => {
    it.each(profiles)('$method: 正確な件数を持たずそのまま再共有できる', (profile) => {
      const document = levels(
        Array.from({ length: count }, (_, i) => (i % (profile.boundaries.length + 2)) as Level3),
        profile,
      )
      const bytes = encodeDocument(document, 0x20)
      const restored = decodeDocument(bytes)
      expect(restored).toEqual(document)
      expect(restored.source.kind).toBe('levels')
      expect(restored.source).not.toHaveProperty('counts')
      expect(encodeDocument(restored, 0x20)).toEqual(bytes)
    })
  })

  it.each([-1, 8, 0.5, NaN])('レベル%sを拒否', (value) => {
    expect(() => encodeDocument(levels([value as Level3]), 0x20)).toThrow(CodecError)
  })

  it.each(Array.from({ length: 53 }, (_, index) => index + 1))(
    '完全bit幅%iの最小幅を保存',
    (width) => {
      const maximum = Number((1n << BigInt(width)) - 1n)
      const document = exact([maximum, 0])
      const bytes = encodeDocument(document, 0x22)
      expect(bytes[8]).toBe(width)
      expect(decodeDocument(bytes)).toEqual(document)
      expect(decodeDocument(encodeDocument(document, 0x24))).toEqual(document)
    },
  )

  it('全0はw=1、明示的0と末尾0も維持', () => {
    const document = exact([0, 0, 0])
    expect(encodeDocument(document, 0x22)[8]).toBe(1)
    expect(decodeDocument(encodeDocument(document, 0x22))).toEqual(document)
    expect(decodeDocument(encodeDocument(document, 0x24))).toEqual(document)
  })
})

describe('不正入力を部分的に受け入れない', () => {
  it('全未知IDを拒否', () => {
    for (let format = 0; format < 256; format++) {
      if (Object.values(FORMAT_IDS).some((id) => id === format)) continue
      expect(() => decodeDocument(wire(format, 1, [0, 1, 0]))).toThrow(CodecError)
    }
  })

  it.each([0x21, 0x23, 0x25])('予約済み圧縮ID%iを明確に拒否', (format) => {
    expect(() => decodeDocument(wire(format, 1, [0, 1, 0]))).toThrow(/圧縮形式/)
    expect(() => encodeDocument(exact([0]), format as UncompressedFormatId)).toThrow(CodecError)
  })

  it.each(golden)('全位置の切断・余剰バイトを拒否: $name', ({ bytes }) => {
    const valid = Uint8Array.from(bytes)
    for (let end = 0; end < valid.length; end++) {
      expect(() => decodeDocument(valid.subarray(0, end))).toThrow(CodecError)
    }
    expect(() => decodeDocument(Uint8Array.of(...valid, 0))).toThrow(CodecError)
    expect(() => decodeDocument(Uint8Array.of(...valid, 0xff))).toThrow(CodecError)
  })

  it.each([
    [0x20, 1, [0, 1, 1]], // compact padding
    [0x20, 2, [0, 1, 0x3d]], // compact padding
    [0x22, 1, [0, 1, 1, 1]], // exact padding
    [0x22, 2, [0, 1, 3, 0x3d]], // exact padding
    [0x22, 1, [0, 1, 0, 0]], // width0
    [0x22, 1, [0, 1, 54, 0, 0, 0, 0, 0, 0, 0]], // width54
    [0x22, 1, [0, 1, 255, 0]],
    [0x22, 1, [0, 1, 2, 0]], // zero must be width1
    [0x22, 1, [0, 1, 2, 0x40]], // 1 must be width1
    [0x22, 2, [0, 1, 3, 0x28]], // [1,2] must be width2
    [0x24, 1, [0, 1, 0x80]], // truncated varint
    [0x24, 1, [0, 1, 0x80, 0]], // redundant zero
    [0x24, 1, [0, 1, 0x81, 0]], // redundant one
    [0x24, 2, [0, 1, 0]], // dayCountより値が不足
  ] as const)('payload防御 形式%i / %i日 / %j', (format, days, body) => {
    expect(() => decodeDocument(wire(format, days, [...body]))).toThrow(CodecError)
  })

  it('53bitを超えるULEB128件数を拒否', () => {
    expect(() =>
      decodeDocument(wire(0x24, 1, [0, 1, 128, 128, 128, 128, 128, 128, 128, 16])),
    ).toThrow(CodecError)
  })

  it('過大なバイト列・ボディ・dを拒否', () => {
    expect(() => decodeDocument(new Uint8Array(49_153))).toThrow(CodecError)
    const bytes = new Uint8Array(MAX_BODY_BYTES + 7)
    bytes.set([0x24, 0, 0, 0, 0, 1])
    expect(() => decodeDocument(bytes)).toThrow(/40KiB/)
    expect(() => decodeDParameter('A'.repeat(65_537))).toThrow(CodecError)
    expect(() => decodeDParameter('A'.repeat(65_536))).toThrow(CodecError)
  })

  it('不正なdは一切ドキュメントを返さない', () => {
    for (const d of [
      '',
      'IAAAAAABAAHg=',
      'IAAAAAABAAHh',
      'IAAAAAABAAH',
      '+AAAAAABAAHg',
      'IAAAAAABAAHg\n',
    ]) {
      expect(() => decodeDParameter(d)).toThrow(CodecError)
    }
  })

  it('MAXを含む最大日数の各形式でも切断・余剰を拒否', () => {
    for (const format of FORMATS) {
      const bytes = encodeDocument(exact(Array<number>(3660).fill(MAX)), format)
      expect(() => decodeDocument(bytes.subarray(0, -1))).toThrow(CodecError)
      const extra = new Uint8Array(bytes.length + 1)
      extra.set(bytes)
      expect(() => decodeDocument(extra)).toThrow(CodecError)
    }
  })
})

// 固定値に依存してもpresetの公開定義そのものを書き換えていないことを確認。
it('プリセット3種類の固定境界は保持される', () => {
  expect(PRESETS.map((p) => p.boundaries)).toEqual([
    [2, 3, 5, 10, 20, 50],
    [50, 100, 300, 500, 700, 1000],
    [100, 500, 1000, 5000, 10000, 50000],
  ])
})
