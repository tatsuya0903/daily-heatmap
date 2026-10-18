import { dateToEpochDay, epochDayToDate } from './dates'
import { InputError } from './inputError'
import { MAX_FILE_BYTES, MAX_SERIES_DAYS } from './limits'
import type { ExactSeries } from './series'

export interface TsvRow {
  readonly line: number
  readonly epochDay: number
  readonly cells: readonly string[]
}

export interface ParsedTsv {
  readonly headers: readonly string[]
  readonly rows: readonly TsvRow[]
}

export function validateFileSize(bytes: number): void {
  if (bytes > MAX_FILE_BYTES) {
    throw new InputError(
      'file-size',
      `ファイルサイズは2MiB（${MAX_FILE_BYTES}バイト）以内にしてください。`,
    )
  }
}

// 数値はここで評価せず、未選択列も含む構造と日付だけを検証する。
export function parseTsv(text: string): ParsedTsv {
  validateFileSize(new TextEncoder().encode(text).byteLength)
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  while (lines.at(-1) === '') lines.pop()
  if (lines.length === 0) throw new InputError('empty', 'ファイルが空です。', { row: 1 })
  const headers = lines[0]!.split('\t')
  if (headers.length < 2 || headers[0] !== 'Date') {
    throw new InputError('header', '先頭列をDateとし、1列以上の件数列を指定してください。', {
      row: 1,
      column: 1,
    })
  }
  const names = new Set<string>()
  headers.forEach((name, index) => {
    const location = { row: 1, column: index + 1, columnName: name }
    if (!name.trim()) throw new InputError('header', '列名を空にはできません。', location)
    if (names.has(name)) throw new InputError('header', '列名が重複しています。', location)
    names.add(name)
  })
  if (lines.length === 1) {
    throw new InputError('no-data', 'ヘッダーの後に日付と件数の行を指定してください。', { row: 2 })
  }
  const days = new Set<number>()
  let minDay = Infinity
  let maxDay = -Infinity
  const rows = lines.slice(1).map((line, index): TsvRow => {
    const row = index + 2
    const cells = line.split('\t')
    if (cells.length !== headers.length) {
      const column = Math.min(cells.length, headers.length) + 1
      throw new InputError(
        'columns',
        `列数が一致しません（必要：${headers.length}列、入力：${cells.length}列）。`,
        { row, column, columnName: headers[column - 1] },
      )
    }
    const location = { row, column: 1, columnName: 'Date' }
    const epochDay = dateToEpochDay(cells[0]!, location)
    if (days.has(epochDay)) {
      throw new InputError('duplicate-date', `日付「${cells[0]}」が重複しています。`, location)
    }
    days.add(epochDay)
    minDay = Math.min(minDay, epochDay)
    maxDay = Math.max(maxDay, epochDay)
    if (maxDay - minDay + 1 > MAX_SERIES_DAYS) {
      throw new InputError(
        'period',
        `対象期間は${MAX_SERIES_DAYS.toLocaleString('ja-JP')}日以内にしてください。`,
        location,
      )
    }
    return { line: row, epochDay, cells }
  })
  return { headers, rows }
}

// 列番号は0始まり。Date（0）は対象外。全行成功するまでExactSeriesを返さない。
export function aggregateTsv(parsed: ParsedTsv, selectedColumns: readonly number[]): ExactSeries {
  if (selectedColumns.length === 0) {
    throw new InputError('selection', '件数列を1列以上選択してください。')
  }
  if (
    new Set(selectedColumns).size !== selectedColumns.length ||
    selectedColumns.some(
      (index) => !Number.isInteger(index) || index < 1 || index >= parsed.headers.length,
    )
  ) {
    throw new InputError('selection', '件数列の選択が不正です。')
  }
  const countsByDay = new Map<number, number>()
  for (const row of parsed.rows) {
    let total = 0
    for (const index of selectedColumns) {
      const raw = row.cells[index]!
      const location = { row: row.line, column: index + 1, columnName: parsed.headers[index] }
      if (raw.length === 0 || /\D/.test(raw) || !Number.isSafeInteger(Number(raw))) {
        throw new InputError(
          'count',
          '件数は0以上の10進整数（安全な整数の範囲内）で指定してください。',
          location,
        )
      }
      const count = Number(raw)
      if (count > Number.MAX_SAFE_INTEGER - total) {
        throw new InputError(
          'sum',
          `日付「${row.cells[0]}」の合計が安全な整数の上限を超えています。`,
          location,
        )
      }
      total += count
    }
    countsByDay.set(row.epochDay, total)
  }
  const startDay = Math.min(...countsByDay.keys())
  const endDay = Math.max(...countsByDay.keys())
  return {
    kind: 'exact',
    startDate: epochDayToDate(startDay),
    counts: Array.from(
      { length: endDay - startDay + 1 },
      (_, index) => countsByDay.get(startDay + index) ?? 0,
    ),
  }
}
