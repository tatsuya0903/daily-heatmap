import { describe, expect, it } from 'vitest'
import {
  dateToEpochDay,
  epochDayToDate,
  MAX_EPOCH_DAY,
  MIN_EPOCH_DAY,
  seriesEndDate,
} from './dates'

// 期待値は1970年までのグレゴリオ暦の日数から固定したもの。
describe('UTC epoch day', () => {
  it.each([
    ['0001-01-01', -719162],
    ['0099-01-01', -683368],
    ['0100-01-01', -683003],
    ['1970-01-01', 0],
    ['2000-01-01', 10957],
    ['2000-02-29', 11016],
    ['9999-12-31', 2932896],
  ])('%sと%dを相互変換する', (date, day) => {
    expect(dateToEpochDay(date)).toBe(day)
    expect(epochDayToDate(day)).toBe(date)
  })

  it.each([
    ['0001-12-31', '0002-01-01'],
    ['0098-12-31', '0099-01-01'],
    ['0099-12-31', '0100-01-01'],
    ['0100-12-31', '0101-01-01'],
    ['1999-12-31', '2000-01-01'],
    ['2000-12-31', '2001-01-01'],
    ['9998-12-31', '9999-01-01'],
    ['9999-12-30', '9999-12-31'],
    ['1900-02-28', '1900-03-01'],
    ['2000-02-28', '2000-02-29'],
    ['2000-02-29', '2000-03-01'],
    ['2026-04-30', '2026-05-01'],
    ['2026-03-08', '2026-03-09'],
    ['2026-11-01', '2026-11-02'],
  ])('%sの翌日は%s', (from, to) => {
    expect(dateToEpochDay(to) - dateToEpochDay(from)).toBe(1)
    expect(epochDayToDate(dateToEpochDay(from) + 1)).toBe(to)
    expect(seriesEndDate(from, 2)).toBe(to)
  })

  it.each([
    '',
    '0000-01-01',
    '10000-01-01',
    '2026-2-01',
    '2026-02-1',
    '26-02-01',
    '2026/02/01',
    '2026-02-29',
    '1900-02-29',
    '0100-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-13-01',
    '2026-01-00',
    '2026-01-32',
    ' 2026-01-01',
    '2026-01-01 ',
    '2026-01-01\r',
    '2026-01-01\n',
    '2026-01-01T00:00:00Z',
  ])('不正日付「%s」を拒否する', (value) => {
    expect(() => dateToEpochDay(value)).toThrow(/日付/)
  })

  it.each([MIN_EPOCH_DAY - 1, MAX_EPOCH_DAY + 1, 0.5, NaN, Infinity])(
    '範囲外のepoch day %sを拒否する',
    (day) => {
      expect(() => epochDayToDate(day)).toThrow(/日付/)
    },
  )

  it('終了日の範囲外へのはみ出しと不正日数を拒否する', () => {
    expect(seriesEndDate('9999-12-31', 1)).toBe('9999-12-31')
    expect(() => seriesEndDate('9999-12-31', 2)).toThrow(/日付/)
    for (const count of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => seriesEndDate('0001-01-01', count)).toThrow(/対象日数/)
    }
  })
})
