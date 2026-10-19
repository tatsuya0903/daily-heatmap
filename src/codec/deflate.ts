import {
  deflateRaw,
  Z_BUF_ERROR,
  Z_FINISH,
  Z_OK,
  Z_STREAM_END,
  ZStream,
  zlibInflate,
  zlibInflateEnd,
  zlibInflateInit2,
} from 'pako'
import { CodecError } from './errors'
import { HEADER_BYTES, MAX_BINARY_BYTES, MAX_BODY_BYTES } from './limits'

// pako 3.0.2 + these options define the compressed Golden fixtures.
export function deflateBody(body: Uint8Array): Uint8Array {
  if (body.length > MAX_BODY_BYTES) throw new CodecError('size', 'ボディが40KiBを超えます。')
  try {
    return deflateRaw(body, { level: 6, windowBits: 15, memLevel: 8, strategy: 0 })
  } catch {
    throw new CodecError('compression', 'raw DEFLATEの圧縮に失敗しました。')
  }
}

/** One bounded low-level call: never use the auto-growing inflateRaw wrapper. */
export function inflateBody(input: Uint8Array): Uint8Array {
  if (input.length > MAX_BINARY_BYTES - HEADER_BYTES) {
    throw new CodecError('size', '圧縮入力が上限を超えます。')
  }
  const stream = new ZStream()
  try {
    if (zlibInflateInit2(stream, -15) !== Z_OK) {
      throw new CodecError('compression', 'raw DEFLATEの初期化に失敗しました。')
    }
    const output = new Uint8Array(MAX_BODY_BYTES)
    stream.input = input
    stream.avail_in = input.length
    stream.output = output
    stream.avail_out = output.length
    const status = zlibInflate(stream, Z_FINISH)

    // Capacity, parsed stream end, and input consumption are independent.
    if (stream.next_out > MAX_BODY_BYTES || stream.avail_out < 0) {
      throw new CodecError('size', '展開結果が40KiBを超えます。')
    }
    if (status !== Z_STREAM_END) {
      if (stream.avail_out === 0 && (status === Z_BUF_ERROR || status === Z_OK)) {
        throw new CodecError('size', '展開が40KiBの上限に達し、正常終了していません。')
      }
      throw new CodecError('compression', '圧縮データが不正、または途中で切断されています。')
    }
    // next_in is byte-aligned by pako at stream end. Unused bits in the last
    // consumed byte are allowed by DEFLATE; additional bytes are not.
    if (stream.next_in !== input.length || stream.avail_in !== 0) {
      throw new CodecError('compression', '圧縮ストリームの末尾に余剰バイトがあります。')
    }
    return output.subarray(0, stream.next_out)
  } catch (error) {
    if (error instanceof CodecError) throw error
    throw new CodecError('compression', 'raw DEFLATEの展開に失敗しました。')
  } finally {
    zlibInflateEnd(stream)
  }
}
