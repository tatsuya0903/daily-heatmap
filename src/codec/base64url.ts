import { CodecError } from './errors'
import { MAX_BINARY_BYTES, MAX_D_PARAMETER_CHARS } from './limits'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function encodeBase64Url(bytes: Uint8Array): string {
  if (bytes.length > MAX_BINARY_BYTES) throw new CodecError('size', 'バイト列が上限を超えます。')
  let result = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = buffer * 256 + byte
    bits += 8
    while (bits >= 6) {
      bits -= 6
      result += ALPHABET[Math.floor(buffer / 2 ** bits)]!
      buffer %= 2 ** bits
    }
  }
  if (bits > 0) result += ALPHABET[buffer * 2 ** (6 - bits)]!
  return result
}

export function decodeBase64Url(value: string): Uint8Array {
  if (value.length > MAX_D_PARAMETER_CHARS) {
    throw new CodecError('size', 'dパラメータは65,536文字以内で指定してください。')
  }
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    throw new CodecError('base64url', 'Base64URLの文字または長さが不正です（=は不要です）。')
  }
  const bytes = new Uint8Array(Math.floor((value.length * 6) / 8))
  let position = 0
  let buffer = 0
  let bits = 0
  for (const character of value) {
    buffer = buffer * 64 + ALPHABET.indexOf(character)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[position++] = Math.floor(buffer / 2 ** bits)
      buffer %= 2 ** bits
    }
  }
  if (buffer !== 0 || encodeBase64Url(bytes) !== value) {
    throw new CodecError('base64url', 'Base64URLが非正規の表現です。')
  }
  return bytes
}
