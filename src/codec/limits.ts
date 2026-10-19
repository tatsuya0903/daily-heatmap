// SPEC 5.4。文字列の検査は復号用バッファを確保する前に行う。
export const MAX_D_PARAMETER_CHARS = 65_536
export const MAX_BODY_BYTES = 40 * 1024
export const MAX_BINARY_BYTES = (MAX_D_PARAMETER_CHARS * 3) / 4
export const HEADER_BYTES = 6
