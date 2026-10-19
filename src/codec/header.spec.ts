import { describe, expect, it } from 'vitest'
import { CodecError } from './errors'
import { FORMAT_IDS } from './formats'
import { decodeHeader, encodeHeader } from './header'

// 日付差分はグレゴリオ暦の閏年数と通算日数から独立に計算。
const dates = [
  ['0001-01-01', [0xf5, 0x06, 0xc6]], // -719162
  ['0099-12-31', [0xf5, 0x94, 0x04]], // -683004
  ['0100-01-01', [0xf5, 0x94, 0x05]], // -683003
  ['1969-12-31', [0xff, 0xff, 0xff]], // -1
  ['1970-01-01', [0, 0, 0]],
  ['2000-02-29', [0, 0x2b, 8]], // 11016
  ['9999-12-31', [0x2c, 0xc0, 0xa0]], // 2932896
] as const

describe('共通6バイトヘッダー', () => {
  describe.each(Object.values(FORMAT_IDS))('予約ID 0x%sのGolden', (format) => {
    it.each(dates)('%s', (startDate, epochBytes) => {
      const header = { format, startDate, dayCount: 1 }
      const bytes = Uint8Array.of(format, ...epochBytes, 0, 1)
      expect(encodeHeader(header)).toEqual(bytes)
      expect(decodeHeader(bytes)).toEqual(header)
    })
  })

  it('日数3,660はBEの0e 4c', () => {
    const bytes = Uint8Array.of(0x20, 0, 0, 0, 0x0e, 0x4c)
    const header = { format: FORMAT_IDS.compact, startDate: '1970-01-01', dayCount: 3660 }
    expect(encodeHeader(header)).toEqual(bytes)
    expect(decodeHeader(bytes)).toEqual(header)
  })

  it.each([0, 3661, 65535, -1, 0.5, NaN])('不正日数を拒否: %s', (dayCount) => {
    expect(() => encodeHeader({ format: 0x20, startDate: '1970-01-01', dayCount })).toThrow(
      CodecError,
    )
  })

  it.each([0, 3661, 65535])('不正日数%iのヘッダーを拒否', (dayCount) => {
    expect(() =>
      decodeHeader(Uint8Array.of(0x20, 0, 0, 0, Math.floor(dayCount / 256), dayCount % 256)),
    ).toThrow(CodecError)
  })

  it.each(['0000-12-31', '10000-01-01', '2026-02-29', '2000-13-01', '99-01-01'])(
    '不正日付を拒否: %s',
    (startDate) => {
      expect(() => encodeHeader({ format: 0x20, startDate, dayCount: 1 })).toThrow(CodecError)
    },
  )

  it.each([
    [0xf5, 0x06, 0xc5], // 最小日の1日前
    [0x2c, 0xc0, 0xa1], // 最大日の1日後
    [0x80, 0, 0], // signed24最小
    [0x7f, 0xff, 0xff], // signed24最大
  ])('日付範囲外のepoch dayを拒否: %j', (...epochBytes) => {
    expect(() => decodeHeader(Uint8Array.of(0x20, ...epochBytes, 0, 1))).toThrow(CodecError)
  })

  it('終了日の範囲超過を双方で拒否', () => {
    expect(() => encodeHeader({ format: 0x20, startDate: '9999-12-31', dayCount: 2 })).toThrow(
      CodecError,
    )
    expect(() => decodeHeader(Uint8Array.of(0x20, 0x2c, 0xc0, 0xa0, 0, 2))).toThrow(CodecError)
  })

  it.each([0, 1, 2, 3, 4, 5])('短いヘッダー%iバイトを拒否', (length) => {
    expect(() => decodeHeader(new Uint8Array(length))).toThrow(/6バイト/)
  })

  it('未知IDを拒否', () => {
    expect(() => decodeHeader(Uint8Array.of(0x26, 0, 0, 0, 0, 1))).toThrow(/未知/)
  })
})
