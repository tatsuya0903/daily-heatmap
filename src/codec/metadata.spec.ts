import { describe, expect, it } from 'vitest'
import type { ThresholdProfile } from '../domain/thresholds'
import { ByteReader, ByteWriter } from './bytes'
import { CodecError } from './errors'
import { decodeDocument, encodeDocument, FORMAT_IDS } from './index'
import { readMetadata, writeMetadata } from './metadata'

const MAX = Number.MAX_SAFE_INTEGER
const MAX_BYTES = [255, 255, 255, 255, 255, 255, 255, 15]

function encoded(profile: ThresholdProfile): number[] {
  const writer = new ByteWriter()
  writeMetadata(writer, profile)
  return [...writer.toBytes()]
}

describe('閾値metadata', () => {
  it.each([
    ['linear', 1],
    ['quantile', 2],
    ['log', 3],
  ] as const)('%sの方式IDと手計算の差分', (method, id) => {
    const profile: ThresholdProfile = { method, boundaries: [2, 130, 131] }
    const bytes = [id, 3, 2, 128, 1, 1]
    expect(encoded(profile)).toEqual(bytes)
    const reader = new ByteReader(Uint8Array.from(bytes))
    expect(readMetadata(reader)).toEqual(profile)
    reader.finish()
    expect(encoded({ method, boundaries: [] })).toEqual([id, 0])
    expect(readMetadata(new ByteReader(Uint8Array.of(id, 0)))).toEqual({ method, boundaries: [] })
  })

  it('customの6境界は方式ID4、差分ULEB128', () => {
    const profile: ThresholdProfile = { method: 'custom', boundaries: [2, 3, 5, 10, 20, 50] }
    const bytes = [4, 6, 2, 1, 2, 5, 10, 30]
    expect(encoded(profile)).toEqual(bytes)
    expect(readMetadata(new ByteReader(Uint8Array.from(bytes)))).toEqual(profile)
  })

  it('差分の最大安全整数も正確に保持', () => {
    const profile: ThresholdProfile = { method: 'log', boundaries: [MAX] }
    expect(encoded(profile)).toEqual([3, 1, ...MAX_BYTES])
    expect(readMetadata(new ByteReader(Uint8Array.of(3, 1, ...MAX_BYTES)))).toEqual(profile)
  })

  it.each([
    [],
    [5],
    [255],
    [0],
    [0, 3],
    [0, ...MAX_BYTES],
    [0, 0x80],
    [0, 0x80, 0],
    [0, 0x81, 0],
    [1],
    [1, 7],
    [1, 255],
    [4, 0],
    [4, 5, 2, 1, 1, 1, 1],
    [4, 7, 2, 1, 1, 1, 1, 1, 1],
    [1, 1, 0],
    [1, 1, 1],
    [1, 2, 2, 0],
    [1, 2, 2],
    [1, 1, 0x82],
    [1, 1, 0x82, 0],
    [1, 2, ...MAX_BYTES, 1],
    [1, 1, 128, 128, 128, 128, 128, 128, 128, 16],
  ])('不正な閾値metadataを拒否: %j', (...bytes) => {
    expect(() => readMetadata(new ByteReader(Uint8Array.from(bytes)))).toThrow(CodecError)
  })

  const invalidProfiles: unknown[] = [
    { method: 'preset', presetId: 3, boundaries: [2, 3, 5, 10, 20, 50] },
    { method: 'preset', presetId: 0, boundaries: [2, 3, 4, 10, 20, 50] },
    { method: 'preset', presetId: 1, boundaries: [] },
    { method: 'linear', presetId: 0, boundaries: [2] },
    { method: 'quantile', presetId: 1, boundaries: [2] },
    { method: 'log', presetId: 2, boundaries: [2] },
    { method: 'custom', presetId: 0, boundaries: [2, 3, 4, 5, 6, 7] },
    { method: 'unknown', boundaries: [] },
    { method: 'custom', boundaries: [] },
    { method: 'custom', boundaries: [2, 3, 4, 5, 6] },
    { method: 'linear', boundaries: [1] },
    { method: 'linear', boundaries: [0] },
    { method: 'linear', boundaries: [-1] },
    { method: 'linear', boundaries: [2, 2] },
    { method: 'linear', boundaries: [3, 2] },
    { method: 'linear', boundaries: [2.5] },
    { method: 'linear', boundaries: [NaN] },
    { method: 'linear', boundaries: [Infinity] },
    { method: 'linear', boundaries: [MAX + 1] },
    { method: 'linear', boundaries: [2, 3, 4, 5, 6, 7, 8] },
  ]

  it.each(invalidProfiles)('内部モデルの不整合もエンコードしない: %j', (invalid) => {
    for (const format of [FORMAT_IDS.compact, FORMAT_IDS.exactBits, FORMAT_IDS.exactVarint]) {
      expect(() =>
        encodeDocument(
          {
            source: { kind: 'exact', startDate: '1970-01-01', counts: [0] },
            thresholds: invalid as ThresholdProfile,
          },
          format,
        ),
      ).toThrow(CodecError)
    }
  })

  it.each([0x20, 0x22, 0x24])('全形式%iで未知方式・不正差分を拒否', (format) => {
    const payload = format === 0x22 ? [1, 0] : [0]
    for (const metadata of [[5], [0, 3], [1, 2, 2, 0], [1, 2, ...MAX_BYTES, 1], [1, 1, 0x82, 0]]) {
      expect(() =>
        decodeDocument(Uint8Array.of(format, 0, 0, 0, 0, 1, ...metadata, ...payload)),
      ).toThrow(CodecError)
    }
  })
})
