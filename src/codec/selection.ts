import { bodyFormat, FORMAT_IDS, isUncompressedFormatId, type FormatId } from './formats'

export type ShareMode = 'compact' | 'exact'

export interface ShareEncoding {
  readonly format: FormatId
  readonly d: string
  readonly length: number
}

// Internal comparator, also exercised with synthetic equal-length candidates.
export function compareShareEncodings(a: ShareEncoding, b: ShareEncoding): number {
  return (
    a.length - b.length ||
    Number(!isUncompressedFormatId(a.format)) - Number(!isUncompressedFormatId(b.format)) ||
    Number(bodyFormat(a.format) === FORMAT_IDS.exactVarint) -
      Number(bodyFormat(b.format) === FORMAT_IDS.exactVarint) ||
    a.format - b.format
  )
}
