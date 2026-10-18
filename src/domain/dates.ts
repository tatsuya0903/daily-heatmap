import { InputError, type InputLocation } from './inputError'

const MILLISECONDS_PER_DAY = 86_400_000
export const MIN_EPOCH_DAY = -719_162 // 0001-01-01
export const MAX_EPOCH_DAY = 2_932_896 // 9999-12-31

export function dateToEpochDay(value: string, location: InputLocation = {}): number {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InputError('date', '日付はYYYY-MM-DD形式で指定してください。', location)
  }
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  // Date.UTC(year, ...)の0〜99年の補正を避け、UTCだけで組み立てる。
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  if (
    year < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new InputError(
      'date',
      `日付「${value}」は実在する0001〜9999年の日付ではありません。`,
      location,
    )
  }
  return date.getTime() / MILLISECONDS_PER_DAY
}

export function epochDayToDate(epochDay: number): string {
  if (!Number.isInteger(epochDay) || epochDay < MIN_EPOCH_DAY || epochDay > MAX_EPOCH_DAY) {
    throw new InputError('date-range', '日付は0001-01-01〜9999-12-31の範囲で指定してください。')
  }
  return new Date(epochDay * MILLISECONDS_PER_DAY).toISOString().slice(0, 10)
}

export function seriesEndDate(startDate: string, dayCount: number): string {
  if (!Number.isSafeInteger(dayCount) || dayCount < 1) {
    throw new InputError('day-count', '対象日数は1以上の安全な整数で指定してください。')
  }
  return epochDayToDate(dateToEpochDay(startDate) + dayCount - 1)
}
