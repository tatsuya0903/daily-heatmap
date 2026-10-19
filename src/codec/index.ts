import type { HeatmapDocument } from '../domain/series'
import { decodeBase64Url, encodeBase64Url } from './base64url'
import { decodeBody, encodeBody } from './body'
import { deflateBody, inflateBody } from './deflate'
import { CodecError } from './errors'
import {
  bodyFormat,
  FORMAT_IDS,
  isFormatId,
  isUncompressedFormatId,
  type FormatId,
} from './formats'
import { decodeHeader, encodeHeader } from './header'
import { HEADER_BYTES, MAX_BINARY_BYTES } from './limits'
import { compareShareEncodings, type ShareEncoding, type ShareMode } from './selection'

export { CodecError } from './errors'
export type { CodecErrorCode } from './errors'
export { FORMAT_IDS } from './formats'
export type { CompressedFormatId, FormatId, UncompressedFormatId } from './formats'
export type { ShareEncoding, ShareMode } from './selection'
export { decodeBase64Url, encodeBase64Url } from './base64url'
export { MAX_BODY_BYTES, MAX_D_PARAMETER_CHARS } from './limits'

/** 6形式から明示指定する。既存の非圧縮形式のバイト列は不変。 */
export function encodeDocument(document: HeatmapDocument, format: FormatId): Uint8Array {
  if (!isFormatId(format)) throw new CodecError('format', '未知の形式IDです。')
  const { source } = document
  const header = encodeHeader({
    format,
    startDate: source.startDate,
    dayCount: source.kind === 'exact' ? source.counts.length : source.levels.length,
  })
  const raw = encodeBody(document, bodyFormat(format))
  const body = isUncompressedFormatId(format) ? raw : deflateBody(raw)
  const bytes = new Uint8Array(HEADER_BYTES + body.length)
  bytes.set(header)
  bytes.set(body, HEADER_BYTES)
  return bytes
}

/** 検証を完了したHeatmapDocumentだけを返す。失敗時はCodecErrorをthrowする。 */
export function decodeDocument(bytes: Uint8Array): HeatmapDocument {
  if (bytes.length > MAX_BINARY_BYTES) throw new CodecError('size', 'バイト列が上限を超えます。')
  const header = decodeHeader(bytes)
  const body = bytes.subarray(HEADER_BYTES)
  const raw = isUncompressedFormatId(header.format) ? body : inflateBody(body)
  return decodeBody(header, raw, bodyFormat(header.format))
}

export function encodeDParameter(document: HeatmapDocument, format: FormatId): string {
  return encodeBase64Url(encodeDocument(document, format))
}

/** Base64URLまで生成した実文字数で最短候補を決定する。URL生成UIは含まない。 */
export function selectShareEncoding(document: HeatmapDocument, mode: ShareMode): ShareEncoding {
  if (mode !== 'compact' && mode !== 'exact') {
    throw new CodecError('format', '未知の共有モードです。')
  }
  if (mode === 'exact' && document.source.kind !== 'exact') {
    throw new CodecError('data', 'コンパクトデータから正確な件数は復元できません。')
  }
  const formats =
    mode === 'compact'
      ? ([FORMAT_IDS.compact, FORMAT_IDS.compactDeflate] as const)
      : ([
          FORMAT_IDS.exactBits,
          FORMAT_IDS.exactBitsDeflate,
          FORMAT_IDS.exactVarint,
          FORMAT_IDS.exactVarintDeflate,
        ] as const)
  const candidates = formats.map((format) => {
    const d = encodeDParameter(document, format)
    return { format, d, length: d.length }
  })
  return candidates.sort(compareShareEncodings)[0]!
}

export function decodeDParameter(value: string): HeatmapDocument {
  return decodeDocument(decodeBase64Url(value))
}
