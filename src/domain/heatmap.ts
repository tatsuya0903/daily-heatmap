import { dateToEpochDay, epochDayToDate } from './dates'

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

// 閾値方式やデータ取得元を知らない、分類済みの表示契約。
export interface ClassifiedDay {
  level: number
  color: string
  rangeLabel: string
  exactCount?: number
}

export interface HeatmapCell extends ClassifiedDay {
  index: number
  date: string
  epochDay: number
  weekday: number
  weekdayLabel: string
  week: number
  monthKey: string
  monthLabel: string
  day: number
  monthWeek: number
  description: string
}

export interface HeatmapMonth {
  key: string
  label: string
  firstWeek: number
  cells: HeatmapCell[]
}

// JSの剰余は負になるため、1970年以前でも必ず0（日）〜6（土）にする。
export function weekdayOf(epochDay: number): number {
  return (((epochDay + 4) % 7) + 7) % 7
}

export function createHeatmapCells(
  startDate: string,
  days: readonly ClassifiedDay[],
): HeatmapCell[] {
  const start = dateToEpochDay(startDate)
  const firstSunday = start - weekdayOf(start)
  return days.map((value, index) => {
    const epochDay = start + index
    const date = epochDayToDate(epochDay)
    const weekday = weekdayOf(epochDay)
    const weekdayLabel = WEEKDAYS[weekday]!
    const day = Number(date.slice(8, 10))
    const count =
      value.exactCount === undefined ? '' : `${value.exactCount.toLocaleString('ja-JP')}件、`
    return {
      ...value,
      index,
      date,
      epochDay,
      weekday,
      weekdayLabel,
      week: Math.floor((epochDay - firstSunday) / 7),
      monthKey: date.slice(0, 7),
      monthLabel: `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月`,
      day,
      monthWeek: Math.floor((day - 1 + weekdayOf(epochDay - day + 1)) / 7),
      description: `${date.replaceAll('-', '/')}（${weekdayLabel}）：${count}${value.rangeLabel}、レベル${value.level}`,
    }
  })
}

export function groupHeatmapMonths(cells: readonly HeatmapCell[]): HeatmapMonth[] {
  const months: HeatmapMonth[] = []
  for (const cell of cells) {
    let month = months.at(-1)
    if (!month || month.key !== cell.monthKey) {
      month = { key: cell.monthKey, label: cell.monthLabel, firstWeek: cell.week, cells: [] }
      months.push(month)
    }
    month.cells.push(cell)
  }
  return months
}
