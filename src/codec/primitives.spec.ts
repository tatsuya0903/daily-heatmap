import { describe, expect, it } from 'vitest'
import { decodeBase64Url, encodeBase64Url } from './base64url'
import { minimumBitWidth, packBits, unpackBits } from './bits'
import { ByteReader, ByteWriter } from './bytes'
import { CodecError } from './errors'
import { MAX_BINARY_BYTES, MAX_D_PARAMETER_CHARS } from './limits'
import { readUleb128, writeUleb128 } from './uleb128'

function encodeVarint(value: number): number[] {
  const writer = new ByteWriter()
  writeUleb128(writer, value)
  return [...writer.toBytes()]
}

const MAX = Number.MAX_SAFE_INTEGER

describe('ULEB128', () => {
  // 7bitずつ下位桁から並べ、最後以外に0x80を足した手計算値。
  it.each([
    [0, [0]],
    [1, [1]],
    [127, [0x7f]],
    [128, [0x80, 1]],
    [16_383, [0xff, 0x7f]],
    [16_384, [0x80, 0x80, 1]],
    [MAX, [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x0f]],
  ])('Golden: %i', (value, bytes) => {
    expect(encodeVarint(value as number)).toEqual(bytes)
    const reader = new ByteReader(Uint8Array.from(bytes as number[]))
    expect(readUleb128(reader)).toBe(value)
    expect(reader.remaining).toBe(0)
  })

  it.each([
    [],
    [0x80],
    [0xff],
    [0x80, 0],
    [0x81, 0],
    [0xff, 0xff, 0],
    [0x80, 0x80, 0],
    [0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x10], // 2^53
    [0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80], // 8バイトでも継続
    [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f],
  ])('不正表現を拒否: %j', (...bytes) => {
    expect(() => readUleb128(new ByteReader(Uint8Array.from(bytes)))).toThrow(CodecError)
  })

  it.each([-1, 1.5, NaN, Infinity, MAX + 1])('不正値を拒否: %s', (value) => {
    expect(() => encodeVarint(value)).toThrow(CodecError)
  })

  it('次の値を消費しない', () => {
    const reader = new ByteReader(Uint8Array.of(0x80, 1, 0))
    expect(readUleb128(reader)).toBe(128)
    expect(readUleb128(reader)).toBe(0)
    reader.finish()
  })
})

describe('MSB-first bit packing', () => {
  it('Golden: 000 001 010 011 100 101 110 111 = 05 39 77', () => {
    const levels = [0, 1, 2, 3, 4, 5, 6, 7]
    const bytes = Uint8Array.of(0x05, 0x39, 0x77)
    expect(packBits(levels, 3)).toEqual(bytes)
    expect(unpackBits(bytes, 8, 3)).toEqual(levels)
    expect(packBits([1, 7], 3)).toEqual(Uint8Array.of(0x3c))
  })

  it('Golden: 53個の1 + 53個の0 = ff×6 f8 00×7', () => {
    const bytes = Uint8Array.of(255, 255, 255, 255, 255, 255, 248, 0, 0, 0, 0, 0, 0, 0)
    expect(packBits([MAX, 0], 53)).toEqual(bytes)
    expect(unpackBits(bytes, 2, 53)).toEqual([MAX, 0])
  })

  it.each(Array.from({ length: 53 }, (_, index) => index + 1))('幅%iの最大値と0', (width) => {
    const maximum = Number((1n << BigInt(width)) - 1n)
    const values = [0, maximum, Math.floor(maximum / 2), 0]
    expect(minimumBitWidth(values)).toBe(width)
    expect(unpackBits(packBits(values, width), values.length, width)).toEqual(values)
  })

  it('全0の最小幅は1', () => {
    expect(minimumBitWidth([0, 0])).toBe(1)
  })

  it.each([0, 54, -1, 1.5, NaN])('不正幅を拒否: %s', (width) => {
    expect(() => packBits([0], width)).toThrow(CodecError)
    expect(() => unpackBits(Uint8Array.of(0), 1, width)).toThrow(CodecError)
  })

  it('不正値・サイズ・パディングを拒否', () => {
    expect(() => packBits([8], 3)).toThrow(CodecError)
    expect(() => packBits([MAX + 1], 53)).toThrow(CodecError)
    expect(() => packBits([], 3)).toThrow(CodecError)
    expect(() => unpackBits(Uint8Array.of(1), 1, 3)).toThrow(/パディング/)
    expect(() => unpackBits(Uint8Array.of(0, 0), 1, 3)).toThrow(/データ長/)
    expect(() => unpackBits(new Uint8Array(), 1, 3)).toThrow(/データ長/)
    expect(() => unpackBits(new Uint8Array(), 100_000, 53)).toThrow(CodecError)
  })
})

describe('canonical Base64URL', () => {
  // RFCの6bit alphabetに従う固定値。標準Base64の+/は-_に対応する。
  it.each([
    ['', []],
    ['AA', [0]],
    ['_w', [255]],
    ['__8', [255, 255]],
    ['____', [255, 255, 255]],
    ['-___', [251, 255, 255]],
    ['Zg', [102]],
    ['Zm8', [102, 111]],
    ['Zm9v', [102, 111, 111]],
  ])('Golden: %s', (value, numbers) => {
    const bytes = Uint8Array.from(numbers as number[])
    expect(encodeBase64Url(bytes)).toBe(value)
    expect(decodeBase64Url(value as string)).toEqual(bytes)
  })

  it.each([
    'A',
    'AAAAA',
    'AA=',
    'AA==',
    'AA===',
    '+w',
    '/w',
    'A A',
    'AA\n',
    '%41A',
    'あ',
    'ＡＡ',
    'AB',
    'A_',
    'AAB',
    '__9',
  ])('不正文字・長さ・余剰ビット: %j', (value) => {
    expect(() => decodeBase64Url(value)).toThrow(CodecError)
  })

  it('65,536文字まで復号し、超過は確保前に拒否', () => {
    const maximum = 'A'.repeat(MAX_D_PARAMETER_CHARS)
    expect(decodeBase64Url(maximum)).toHaveLength(MAX_BINARY_BYTES)
    expect(encodeBase64Url(new Uint8Array(MAX_BINARY_BYTES))).toBe(maximum)
    expect(() => decodeBase64Url(maximum + 'A')).toThrow(/65,536/)
    expect(() => encodeBase64Url(new Uint8Array(MAX_BINARY_BYTES + 1))).toThrow(CodecError)
  })

  it('決定的な全バイト列の往復（各3バイト境界）', () => {
    const bytes = Uint8Array.from({ length: 768 }, (_, index) => index % 256)
    for (let length = 0; length <= bytes.length; length++) {
      const input = bytes.subarray(0, length)
      expect(decodeBase64Url(encodeBase64Url(input))).toEqual(input)
    }
  })
})

describe('byte boundaries', () => {
  it('切断・余剰・不正バイト・書き込み上限を拒否', () => {
    const reader = new ByteReader(Uint8Array.of(1))
    expect(() => reader.finish()).toThrow(CodecError)
    expect(() => reader.readBytes(2)).toThrow(CodecError)
    expect(() => reader.readBytes(-1)).toThrow(CodecError)
    expect(() => reader.readBytes(0.5)).toThrow(CodecError)
    expect(reader.readByte()).toBe(1)
    expect(() => reader.readByte()).toThrow(CodecError)
    const writer = new ByteWriter(1)
    expect(() => writer.writeByte(256)).toThrow(CodecError)
    writer.writeByte(0)
    expect(() => writer.writeByte(1)).toThrow(CodecError)
  })
})
