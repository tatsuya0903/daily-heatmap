import { CodecError } from './errors'
import { MAX_BODY_BYTES } from './limits'

export class ByteReader {
  private position = 0

  constructor(private readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.length - this.position
  }

  readByte(): number {
    if (this.remaining === 0) throw new CodecError('data', 'データが途中で切断されています。')
    return this.bytes[this.position++]!
  }

  readBytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining) {
      throw new CodecError('data', 'データ長が不足しています。')
    }
    const result = this.bytes.subarray(this.position, this.position + length)
    this.position += length
    return result
  }

  finish(): void {
    if (this.remaining !== 0) throw new CodecError('data', '余剰バイトがあります。')
  }
}

export class ByteWriter {
  private readonly bytes: number[] = []

  constructor(private readonly limit = MAX_BODY_BYTES) {}

  writeByte(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new CodecError('data', '不正なバイト値です。')
    }
    if (this.bytes.length >= this.limit) throw new CodecError('size', 'バイト列が上限を超えます。')
    this.bytes.push(value)
  }

  writeBytes(values: Uint8Array): void {
    for (const value of values) this.writeByte(value)
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

export function validateCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CodecError('data', '件数は0以上の安全整数で指定してください。')
  }
}
