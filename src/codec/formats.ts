// 公開済みIDの意味は固定。
export const FORMAT_IDS = {
  compact: 0x20,
  compactDeflate: 0x21,
  exactBits: 0x22,
  exactBitsDeflate: 0x23,
  exactVarint: 0x24,
  exactVarintDeflate: 0x25,
} as const

export type FormatId = (typeof FORMAT_IDS)[keyof typeof FORMAT_IDS]
export type UncompressedFormatId =
  typeof FORMAT_IDS.compact | typeof FORMAT_IDS.exactBits | typeof FORMAT_IDS.exactVarint
export type CompressedFormatId = Exclude<FormatId, UncompressedFormatId>

export function isFormatId(value: number): value is FormatId {
  return Object.values(FORMAT_IDS).some((id) => id === value)
}

export function isUncompressedFormatId(value: number): value is UncompressedFormatId {
  return (
    value === FORMAT_IDS.compact ||
    value === FORMAT_IDS.exactBits ||
    value === FORMAT_IDS.exactVarint
  )
}

export function bodyFormat(format: FormatId): UncompressedFormatId {
  switch (format) {
    case FORMAT_IDS.compactDeflate:
      return FORMAT_IDS.compact
    case FORMAT_IDS.exactBitsDeflate:
      return FORMAT_IDS.exactBits
    case FORMAT_IDS.exactVarintDeflate:
      return FORMAT_IDS.exactVarint
    default:
      return format
  }
}
