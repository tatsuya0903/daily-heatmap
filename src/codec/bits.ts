import { validateCount } from './bytes'
import { CodecError } from './errors'
import { MAX_BODY_BYTES } from './limits'

function validateShape(count: number, width: number): number {
  if (!Number.isInteger(width) || width < 1 || width > 53) {
    throw new CodecError('data', 'ビット幅は1〜53で指定してください。')
  }
  const byteLength = Math.ceil((count * width) / 8)
  if (!Number.isSafeInteger(count) || count < 1 || byteLength > MAX_BODY_BYTES) {
    throw new CodecError('size', 'ビット列の長さが不正です。')
  }
  return byteLength
}

export function minimumBitWidth(values: readonly number[]): number {
  let maximum = 0
  for (const value of values) {
    validateCount(value)
    maximum = Math.max(maximum, value)
  }
  // Math.log2は2^53-1付近で丸められるため、整数の文字列表現で幅を求める。
  return BigInt(maximum).toString(2).length
}

export function packBits(values: readonly number[], width: number): Uint8Array {
  const bytes = new Uint8Array(validateShape(values.length, width))
  const limit = 1n << BigInt(width)
  let position = 0
  for (const value of values) {
    validateCount(value)
    const integer = BigInt(value)
    if (integer >= limit) throw new CodecError('data', '値が指定ビット幅に収まりません。')
    for (let bit = width - 1; bit >= 0; bit--, position++) {
      if (((integer >> BigInt(bit)) & 1n) !== 0n) {
        const index = Math.floor(position / 8)
        bytes[index] = bytes[index]! + 2 ** (7 - (position % 8))
      }
    }
  }
  return bytes
}

export function unpackBits(bytes: Uint8Array, count: number, width: number): number[] {
  if (bytes.length !== validateShape(count, width)) {
    throw new CodecError('data', 'ビット列のデータ長が日数・ビット幅と一致しません。')
  }
  const padding = (8 - ((count * width) % 8)) % 8
  if (bytes[bytes.length - 1]! % 2 ** padding !== 0) {
    throw new CodecError('padding', '末尾のパディングが0ではありません。')
  }
  const values: number[] = []
  let position = 0
  for (let index = 0; index < count; index++) {
    let value = 0n
    for (let bit = 0; bit < width; bit++, position++) {
      const byte = bytes[Math.floor(position / 8)]!
      value = value * 2n + BigInt(Math.floor(byte / 2 ** (7 - (position % 8))) % 2)
    }
    values.push(Number(value)) // 幅は53以下なので変換前から安全整数。
  }
  return values
}
