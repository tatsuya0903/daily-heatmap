import { dateToEpochDay, epochDayToDate, seriesEndDate } from '../domain/dates'
import { MAX_SERIES_DAYS } from '../domain/limits'
import { ByteReader, ByteWriter } from './bytes'
import { CodecError } from './errors'
import { isFormatId, type FormatId } from './formats'
import { HEADER_BYTES } from './limits'

export interface Header {
  format: FormatId
  startDate: string
  dayCount: number
}

export function validatePeriod(startDate: string, dayCount: number): void {
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > MAX_SERIES_DAYS) {
    throw new CodecError('header', '日数は1〜3,660で指定してください。')
  }
  try {
    seriesEndDate(startDate, dayCount)
  } catch {
    throw new CodecError('date', '開始日・終了日は0001-01-01〜9999-12-31の範囲にしてください。')
  }
}

export function encodeHeader(header: Header): Uint8Array {
  if (!isFormatId(header.format)) throw new CodecError('format', '未知の形式IDです。')
  validatePeriod(header.startDate, header.dayCount)
  const epochDay = dateToEpochDay(header.startDate)
  const unsignedDay = epochDay < 0 ? epochDay + 2 ** 24 : epochDay
  const writer = new ByteWriter(HEADER_BYTES)
  writer.writeByte(header.format)
  writer.writeByte(Math.floor(unsignedDay / 65_536))
  writer.writeByte(Math.floor(unsignedDay / 256) % 256)
  writer.writeByte(unsignedDay % 256)
  writer.writeByte(Math.floor(header.dayCount / 256))
  writer.writeByte(header.dayCount % 256)
  return writer.toBytes()
}

export function decodeHeader(bytes: Uint8Array): Header {
  if (bytes.length < HEADER_BYTES) throw new CodecError('header', 'ヘッダーは6バイト必要です。')
  const reader = new ByteReader(bytes.subarray(0, HEADER_BYTES))
  const format = reader.readByte()
  if (!isFormatId(format)) throw new CodecError('format', '未知の形式IDです。')
  const unsignedDay = reader.readByte() * 65_536 + reader.readByte() * 256 + reader.readByte()
  const epochDay = unsignedDay >= 2 ** 23 ? unsignedDay - 2 ** 24 : unsignedDay
  let startDate: string
  try {
    startDate = epochDayToDate(epochDay)
  } catch {
    throw new CodecError('date', '符号付きepoch dayが対応する日付範囲外です。')
  }
  const dayCount = reader.readByte() * 256 + reader.readByte()
  validatePeriod(startDate, dayCount)
  return { format, startDate, dayCount }
}
