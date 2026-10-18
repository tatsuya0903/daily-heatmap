import { describe, expect, it } from 'vitest'
import { aggregateTsv, parseTsv } from './tsv'
import { dateToEpochDay, epochDayToDate } from './dates'
import { InputError } from './inputError'
import { MAX_FILE_BYTES, MAX_SERIES_DAYS } from './limits'

const exampleA = 'Date\tCount\n2026-04-01\t6\n2026-04-02\t4\n2026-04-11\t45'
const exampleB = 'Date\tA件数\tB件数\n2026-04-01\t3\t3\n2026-04-02\t2\t2\n2026-04-11\t21\t24'
const normalize = (text: string, columns = [1]) => aggregateTsv(parseTsv(text), columns)

function getError(action: () => unknown): InputError {
  let caught: unknown
  try {
    action()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(InputError)
  return caught as InputError
}

describe('TSV解析と列集計', () => {
  it.each(['', '\uFEFF'])('BOM「%s」・LF/CRLF・末尾空行を受け付け、仕様例A/Bが一致する', (bom) => {
    for (const newline of ['\n', '\r\n']) {
      const a = normalize(bom + exampleA.replaceAll('\n', newline) + newline.repeat(3))
      const b = normalize(bom + exampleB.replaceAll('\n', newline), [1, 2])
      expect(a).toEqual({
        kind: 'exact',
        startDate: '2026-04-01',
        counts: [6, 4, 0, 0, 0, 0, 0, 0, 0, 0, 45],
      })
      expect(b).toEqual(a)
      expect(a.counts).toHaveLength(11)
    }
  })

  it('任意の日本語・空白付きヘッダーをそのまま保持し、単一列も複数列も選択できる', () => {
    const parsed = parseTsv('Date\t架空 A 件数\t B件数 \tC\n2026-01-01\t1\t2\t3')
    expect(parsed.headers).toEqual(['Date', '架空 A 件数', ' B件数 ', 'C'])
    expect(aggregateTsv(parsed, [2]).counts).toEqual([2])
    expect(aggregateTsv(parsed, [3, 1]).counts).toEqual([4])
    expect(aggregateTsv(parsed, [1, 2, 3]).counts).toEqual([6])
  })

  it('未選択列の非数値・空欄・負数・巨大数を評価しない', () => {
    const parsed = parseTsv(
      'Date\tCount\t注記\t空欄\t負数\t巨大数\n2026-01-01\t5\t架空の値\t\t-1\t9999999999999999999999999',
    )
    expect(aggregateTsv(parsed, [1]).counts).toEqual([5])
    expect(() => aggregateTsv(parsed, [2])).toThrow(/件数/)
  })

  it.each([
    ['', 'empty'],
    ['\uFEFF\r\n', 'empty'],
    ['Date\tCount', 'no-data'],
    ['\uFEFF\uFEFFDate\tCount\n2026-01-01\t1', 'header'],
    ['date\tCount\n2026-01-01\t1', 'header'],
    ['Count\tDate\n1\t2026-01-01', 'header'],
    ['Date\n2026-01-01', 'header'],
    ['Date,Count\n2026-01-01,1', 'header'],
    ['Date\t\n2026-01-01\t1', 'header'],
    ['Date\t \n2026-01-01\t1', 'header'],
    ['Date\tA\tA\n2026-01-01\t1\t2', 'header'],
    ['Date\tDate\n2026-01-01\t1', 'header'],
    ['Date\tCount\n2026-01-01\t1\n\n2026-01-02\t2', 'columns'],
    ['Date\tCount\n2026-01-01\t1\n \n', 'columns'],
    ['Date\tCount\n2026-02-29\t1', 'date'],
    ['Date\tCount\n2026-01-01\t1\n2026-01-01\t2', 'duplicate-date'],
  ])('不正な構造・日付を拒否する（%s）', (text, code) => {
    expect(getError(() => parseTsv(text)).code).toBe(code)
  })

  it.each([
    ['Date\tCount\t注記\n2026-01-01\t1', 3, '注記'],
    ['Date\tCount\n2026-01-01\t1\t余剰', 3, undefined],
  ])('未選択列を含む列数不一致に行・列位置を付ける', (text, column, columnName) => {
    expect(getError(() => parseTsv(text))).toMatchObject({
      code: 'columns',
      row: 2,
      column,
      columnName,
    })
  })

  it('重複日は上書き・合算せず、元ファイルの行番号と列を示す', () => {
    expect(
      getError(() => parseTsv('Date\tCount\n2026-01-02\t1\n2026-01-01\t1\n2026-01-02\t3')),
    ).toMatchObject({
      code: 'duplicate-date',
      row: 4,
      column: 1,
      columnName: 'Date',
    })
  })

  it.each([
    '',
    ' ',
    ' 1',
    '1 ',
    '1\r',
    '-1',
    '+1',
    '1.0',
    '1e3',
    '1,000',
    '0x10',
    'NaN',
    'Infinity',
    '１',
    '9007199254740992',
  ])('不正件数「%s」に行・列名を付ける', (raw) => {
    const error = getError(() => normalize(`Date\t架空件数\n2026-01-01\t2\n2026-01-02\t${raw}`))
    expect(error).toMatchObject({ code: 'count', row: 3, column: 2, columnName: '架空件数' })
    expect(error.message).toContain('3行目・2列目・「架空件数」')
  })

  it.each([[], [0], [-1], [2], [1, 1], [1.5], [NaN]].map((columns) => ({ columns })))(
    '不正な列選択%sを拒否する',
    ({ columns }) => {
      expect(getError(() => normalize(exampleA, columns)).code).toBe('selection')
    },
  )

  it('0・先頭0・安全整数の上限ちょうどを受け付ける', () => {
    expect(
      normalize('Date\tCount\n2026-01-01\t0\n2026-01-02\t0003\n2026-01-03\t9007199254740991')
        .counts,
    ).toEqual([0, 3, Number.MAX_SAFE_INTEGER])
    expect(normalize('Date\tA\tB\n2026-01-01\t9007199254740990\t1', [1, 2]).counts).toEqual([
      Number.MAX_SAFE_INTEGER,
    ])
    expect(normalize('Date\tA\tB\n2026-01-01\t9007199254740991\t0', [1, 2]).counts).toEqual([
      Number.MAX_SAFE_INTEGER,
    ])
  })

  it('合算超過を該当日と行・列付きで拒否し、再選択で回復できる', () => {
    const parsed = parseTsv('Date\tA\tB\n2026-01-01\t1\t1\n2026-01-02\t9007199254740991\t1')
    const error = getError(() => aggregateTsv(parsed, [1, 2]))
    expect(error).toMatchObject({ code: 'sum', row: 3, column: 3, columnName: 'B' })
    expect(error.message).toContain('2026-01-02')
    expect(aggregateTsv(parsed, [2]).counts).toEqual([1, 1])
  })

  it.each([
    ['2024-02-28', '2024-03-01', [1, 0, 0]],
    ['2026-04-30', '2026-05-02', [1, 0, 0]],
    ['0099-12-31', '0100-01-02', [1, 0, 0]],
    ['1999-12-31', '2000-01-02', [1, 0, 0]],
    ['2026-03-07', '2026-03-09', [1, 0, 0]],
    ['2026-10-31', '2026-11-02', [1, 0, 0]],
  ])('逆順の%s〜%sを日付順に補完し末尾0も保持する', (start, end, counts) => {
    expect(normalize(`Date\tCount\n${end}\t0\n${start}\t1`)).toEqual({
      kind: 'exact',
      startDate: start,
      counts,
    })
  })

  it('単日の全0を保持する', () => {
    expect(normalize('Date\tCount\n0001-01-01\t0').counts).toEqual([0])
    expect(normalize('Date\tCount\n9999-12-31\t0').startDate).toBe('9999-12-31')
  })

  it('3,660日ちょうどは全行・疎な行とも受け付け、3,661日は拒否する', () => {
    const start = dateToEpochDay('2000-01-01')
    const rows = Array.from(
      { length: MAX_SERIES_DAYS },
      (_, i) => `${epochDayToDate(start + i)}\t1`,
    )
    expect(normalize('Date\tCount\n' + rows.join('\n')).counts).toEqual(
      Array(MAX_SERIES_DAYS).fill(1),
    )
    expect(normalize(`Date\tCount\n${rows.at(-1)}\n${rows[0]}`).counts).toHaveLength(
      MAX_SERIES_DAYS,
    )
    const error = getError(() =>
      normalize(`Date\tCount\n2000-01-01\t1\n${epochDayToDate(start + MAX_SERIES_DAYS)}\t1`),
    )
    expect(error).toMatchObject({ code: 'period', row: 3, column: 1 })
  })

  it.each(['', '\uFEFF'])(
    'BOM「%s」込みのUTF-8実バイトで2MiBちょうどを受け付け、1バイト超過は拒否する',
    (bom) => {
      const base = bom + 'Date\t件数\t注記\n2026-01-01\t1\t'
      const text = base + 'a'.repeat(MAX_FILE_BYTES - new TextEncoder().encode(base).byteLength)
      expect(new TextEncoder().encode(text)).toHaveLength(MAX_FILE_BYTES)
      expect(normalize(text).counts).toEqual([1])
      expect(getError(() => normalize(text + 'a')).code).toBe('file-size')
    },
  )
})
