export interface InputLocation {
  row?: number
  column?: number
  columnName?: string
}

export class InputError extends Error {
  readonly row?: number
  readonly column?: number
  readonly columnName?: string

  constructor(
    readonly code: string,
    reason: string,
    location: InputLocation = {},
  ) {
    const position = [
      location.row === undefined ? '' : `${location.row}行目`,
      location.column === undefined ? '' : `${location.column}列目`,
      location.columnName === undefined ? '' : `「${location.columnName}」`,
    ]
      .filter(Boolean)
      .join('・')
    super(position ? `${position}：${reason}` : reason)
    this.name = 'InputError'
    this.row = location.row
    this.column = location.column
    this.columnName = location.columnName
  }
}
