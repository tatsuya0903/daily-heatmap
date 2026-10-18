import { InputError } from './inputError'
import { parseTsv, validateFileSize, type ParsedTsv } from './tsv'

// Vueと独立したFile APIの境界。サイズはファイルをメモリーに読む前に検証する。
export async function readTsvFile(file: File): Promise<ParsedTsv> {
  validateFileSize(file.size)
  if (!/\.(tsv|txt)$/i.test(file.name)) {
    throw new InputError('file-type', '.tsvまたは.txtのファイルを選択してください。')
  }
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    throw new InputError('file-read', 'ファイルを読み込めませんでした。もう一度選択してください。')
  }
  let text: string
  try {
    // BOMの除去と実バイト数の検証はparseTsvに統一する。
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer)
  } catch {
    throw new InputError('encoding', 'UTF-8で保存したTSVファイルを選択してください。')
  }
  return parseTsv(text)
}
