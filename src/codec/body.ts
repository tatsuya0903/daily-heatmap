import type { HeatmapDocument, Level3 } from '../domain/series'
import { classifyCount } from '../domain/thresholds'
import { minimumBitWidth, packBits, unpackBits } from './bits'
import { ByteReader, ByteWriter, validateCount } from './bytes'
import { CodecError } from './errors'
import { FORMAT_IDS, type UncompressedFormatId } from './formats'
import { validatePeriod, type Header } from './header'
import { MAX_BODY_BYTES } from './limits'
import { normalizeMetadata, readMetadata, writeMetadata } from './metadata'
import { readUleb128, writeUleb128 } from './uleb128'

function validateLevels(
  values: readonly number[],
  boundaryCount: number,
): asserts values is Level3[] {
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value > boundaryCount + 1) {
      throw new CodecError('data', 'コンパクトレベルが境界数の範囲外です。')
    }
  }
}

// ヘッダーと独立したrawボディ。Issue #7ではこのボディ全体が圧縮対象になる。
export function encodeBody(document: HeatmapDocument, format: UncompressedFormatId): Uint8Array {
  const { source } = document
  const values = source.kind === 'exact' ? source.counts : source.levels
  validatePeriod(source.startDate, values.length)
  const profile = normalizeMetadata(document.thresholds)
  const writer = new ByteWriter()
  writeMetadata(writer, profile)
  switch (format) {
    case FORMAT_IDS.compact: {
      const levels =
        source.kind === 'exact'
          ? source.counts.map((count) => {
              validateCount(count)
              return classifyCount(count, profile.boundaries)
            })
          : source.levels
      validateLevels(levels, profile.boundaries.length)
      writer.writeBytes(packBits(levels, 3))
      break
    }
    case FORMAT_IDS.exactBits:
    case FORMAT_IDS.exactVarint: {
      if (source.kind !== 'exact') {
        throw new CodecError('data', 'コンパクトデータから正確な件数は復元できません。')
      }
      if (format === FORMAT_IDS.exactBits) {
        const width = minimumBitWidth(source.counts)
        writer.writeByte(width)
        writer.writeBytes(packBits(source.counts, width))
      } else {
        for (const count of source.counts) writeUleb128(writer, count)
      }
      break
    }
    default:
      throw new CodecError('format', '未対応の非圧縮形式IDです。')
  }
  return writer.toBytes()
}

export function decodeBody(
  header: Header,
  body: Uint8Array,
  format: UncompressedFormatId,
): HeatmapDocument {
  validatePeriod(header.startDate, header.dayCount)
  if (body.length > MAX_BODY_BYTES) throw new CodecError('size', 'ボディが40KiBを超えます。')
  const reader = new ByteReader(body)
  const thresholds = readMetadata(reader)
  const { startDate, dayCount } = header
  switch (format) {
    case FORMAT_IDS.compact: {
      const levels = unpackBits(reader.readBytes(reader.remaining), dayCount, 3)
      validateLevels(levels, thresholds.boundaries.length)
      return { source: { kind: 'levels', startDate, levels }, thresholds }
    }
    case FORMAT_IDS.exactBits: {
      const width = reader.readByte()
      const counts = unpackBits(reader.readBytes(reader.remaining), dayCount, width)
      if (minimumBitWidth(counts) !== width) {
        throw new CodecError('data', '件数のビット幅が最小幅ではありません。')
      }
      return { source: { kind: 'exact', startDate, counts }, thresholds }
    }
    case FORMAT_IDS.exactVarint: {
      const counts: number[] = []
      for (let index = 0; index < dayCount; index++) counts.push(readUleb128(reader))
      reader.finish()
      return { source: { kind: 'exact', startDate, counts }, thresholds }
    }
    default:
      throw new CodecError('format', '未対応の非圧縮形式IDです。')
  }
}
