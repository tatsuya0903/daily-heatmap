import { ByteReader, ByteWriter, validateCount } from './bytes'
import { CodecError } from './errors'

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

export function writeUleb128(writer: ByteWriter, value: number): void {
  validateCount(value)
  let rest = BigInt(value)
  do {
    const payload = Number(rest % 128n)
    rest /= 128n
    writer.writeByte(payload + (rest > 0n ? 128 : 0))
  } while (rest > 0n)
}

export function readUleb128(reader: ByteReader): number {
  let value = 0n
  // 安全整数は最大8バイト。継続ビットを無制限に走査しない。
  for (let index = 0; index < 8; index++) {
    if (reader.remaining === 0) throw new CodecError('varint', 'ULEB128が途中で切断されています。')
    const byte = reader.readByte()
    const payload = byte % 128
    value += BigInt(payload) << BigInt(index * 7)
    if (value > MAX_SAFE) throw new CodecError('varint', 'ULEB128が安全整数を超えています。')
    if (byte < 128) {
      if (index > 0 && payload === 0) {
        throw new CodecError('varint', 'ULEB128が非正規の冗長表現です。')
      }
      return Number(value)
    }
  }
  throw new CodecError('varint', 'ULEB128の終端ビットが不正です。')
}
