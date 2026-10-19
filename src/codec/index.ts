import type { HeatmapDocument } from '../domain/series'
import { decodeBase64Url, encodeBase64Url } from './base64url'
import { decodeBody, encodeBody } from './body'
import { CodecError } from './errors'
import { isUncompressedFormatId, type UncompressedFormatId } from './formats'
import { decodeHeader, encodeHeader } from './header'
import { HEADER_BYTES, MAX_BINARY_BYTES } from './limits'

export { CodecError } from './errors'
export type { CodecErrorCode } from './errors'
export { FORMAT_IDS } from './formats'
export type { FormatId, UncompressedFormatId } from './formats'
export { decodeBase64Url, encodeBase64Url } from './base64url'
export { MAX_BODY_BYTES, MAX_D_PARAMETER_CHARS } from './limits'

/** 形式を明示指定する。候補の自動選択・圧縮はIssue #7で追加する。 */
export function encodeDocument(
  document: HeatmapDocument,
  format: UncompressedFormatId,
): Uint8Array {
  if (!isUncompressedFormatId(format)) throw new CodecError('format', '未対応の非圧縮形式IDです。')
  const { source } = document
  const header = encodeHeader({
    format,
    startDate: source.startDate,
    dayCount: source.kind === 'exact' ? source.counts.length : source.levels.length,
  })
  const body = encodeBody(document, format)
  const bytes = new Uint8Array(HEADER_BYTES + body.length)
  bytes.set(header)
  bytes.set(body, HEADER_BYTES)
  return bytes
}

/** 検証を完了したHeatmapDocumentだけを返す。失敗時はCodecErrorをthrowする。 */
export function decodeDocument(bytes: Uint8Array): HeatmapDocument {
  if (bytes.length > MAX_BINARY_BYTES) throw new CodecError('size', 'バイト列が上限を超えます。')
  const header = decodeHeader(bytes)
  if (!isUncompressedFormatId(header.format)) {
    throw new CodecError('format', '圧縮形式はまだ対応していません。')
  }
  return decodeBody(header, bytes.subarray(HEADER_BYTES), header.format)
}

export function encodeDParameter(document: HeatmapDocument, format: UncompressedFormatId): string {
  return encodeBase64Url(encodeDocument(document, format))
}

export function decodeDParameter(value: string): HeatmapDocument {
  return decodeDocument(decodeBase64Url(value))
}
