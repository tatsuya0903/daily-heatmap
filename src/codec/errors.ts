export type CodecErrorCode =
  'size' | 'header' | 'format' | 'date' | 'thresholds' | 'data' | 'varint' | 'padding' | 'base64url'

export class CodecError extends Error {
  constructor(
    public readonly code: CodecErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CodecError'
  }
}
