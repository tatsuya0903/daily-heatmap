import { normalizeThresholdProfile, PRESETS, type ThresholdProfile } from '../domain/thresholds'
import { ByteReader, ByteWriter } from './bytes'
import { CodecError } from './errors'
import { readUleb128, writeUleb128 } from './uleb128'

const METHODS = ['preset', 'linear', 'quantile', 'log', 'custom'] as const

export function normalizeMetadata(profile: ThresholdProfile): ThresholdProfile {
  try {
    return normalizeThresholdProfile(profile)
  } catch (error) {
    throw new CodecError(
      'thresholds',
      error instanceof Error ? error.message : '閾値定義が不正です。',
    )
  }
}

export function writeMetadata(writer: ByteWriter, profile: ThresholdProfile): void {
  const normalized = normalizeMetadata(profile)
  writer.writeByte(METHODS.indexOf(normalized.method))
  if (normalized.method === 'preset') {
    writeUleb128(writer, normalized.presetId)
    return
  }
  writer.writeByte(normalized.boundaries.length)
  let previous = 0
  for (const boundary of normalized.boundaries) {
    writeUleb128(writer, boundary - previous)
    previous = boundary
  }
}

export function readMetadata(reader: ByteReader): ThresholdProfile {
  const method = METHODS[reader.readByte()]
  if (method === undefined) throw new CodecError('thresholds', '未知の閾値方式です。')
  if (method === 'preset') {
    const id = readUleb128(reader)
    const preset = PRESETS.find((entry) => entry.id === id)
    if (!preset) throw new CodecError('thresholds', '未知のプリセットIDです。')
    return normalizeMetadata({ method, presetId: preset.id, boundaries: preset.boundaries })
  }
  const count = reader.readByte()
  if (count > 6 || (method === 'custom' && count !== 6)) {
    throw new CodecError('thresholds', '境界数が不正です（最大6個、customは6個）。')
  }
  const boundaries: number[] = []
  let previous = 0
  for (let index = 0; index < count; index++) {
    const delta = readUleb128(reader)
    // 加算前にBigIntで検証し、安全整数上限での丸めを防ぐ。
    const boundary = BigInt(previous) + BigInt(delta)
    if (delta === 0 || boundary > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new CodecError('thresholds', '境界値の差分または安全整数範囲が不正です。')
    }
    previous = Number(boundary)
    boundaries.push(previous)
  }
  return normalizeMetadata({ method, boundaries })
}
