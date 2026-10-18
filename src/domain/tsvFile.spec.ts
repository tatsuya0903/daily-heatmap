import { describe, expect, it, vi } from 'vitest'
import { readTsvFile } from './tsvFile'
import { aggregateTsv } from './tsv'
import { MAX_FILE_BYTES } from './limits'

function fileFromBytes(bytes: Uint8Array, name = 'sample.tsv'): File {
  const file = new File([], name)
  Object.defineProperties(file, {
    size: { value: bytes.byteLength },
    arrayBuffer: { value: vi.fn<File['arrayBuffer']>(async () => bytes.slice().buffer) },
  })
  return file
}

describe('UTF-8ファイル読み込み', () => {
  it.each(['sample.tsv', 'sample.txt', 'SAMPLE.TSV'])('%sを受け付ける', async (name) => {
    const file = fileFromBytes(new TextEncoder().encode('Date\tCount\n2026-01-01\t1'), name)
    expect(aggregateTsv(await readTsvFile(file), [1]).counts).toEqual([1])
  })

  it('UTF-8 BOMと日本語を読み込む', async () => {
    const file = fileFromBytes(new TextEncoder().encode('\uFEFFDate\t架空件数\r\n2026-01-01\t3'))
    expect((await readTsvFile(file)).headers).toEqual(['Date', '架空件数'])
  })

  it('BOMの除去は1回だけにし、重複BOMをヘッダーとして拒否する', async () => {
    const file = fileFromBytes(new TextEncoder().encode('\uFEFF\uFEFFDate\tCount\n2026-01-01\t1'))
    await expect(readTsvFile(file)).rejects.toMatchObject({ code: 'header', row: 1, column: 1 })
  })

  it.each([
    [0x44, 0x61, 0x74, 0x65, 0x09, 0x82, 0xa0], // 不正UTF-8
    [0xff, 0xfe, 0x44, 0x00], // UTF-16 BOM
  ])('不正なUTF-8バイト列%sを拒否する', async (...bytes) => {
    await expect(readTsvFile(fileFromBytes(new Uint8Array(bytes)))).rejects.toMatchObject({
      code: 'encoding',
    })
  })

  it('拡張子が不正なファイルを読む前に拒否する', async () => {
    const file = fileFromBytes(new Uint8Array(), 'sample.csv')
    await expect(readTsvFile(file)).rejects.toMatchObject({ code: 'file-type' })
    expect(file.arrayBuffer).not.toHaveBeenCalled()
  })

  it('2MiB超過を読む前に拒否する', async () => {
    const file = fileFromBytes(new Uint8Array(MAX_FILE_BYTES + 1))
    await expect(readTsvFile(file)).rejects.toMatchObject({ code: 'file-size' })
    expect(file.arrayBuffer).not.toHaveBeenCalled()
  })

  it('BOMを含む2MiBのファイルを受け付ける', async () => {
    const prefix = '\uFEFFDate\tCount\t注記\n2026-01-01\t1\t'
    const text = prefix + 'x'.repeat(MAX_FILE_BYTES - new TextEncoder().encode(prefix).length)
    expect(
      aggregateTsv(await readTsvFile(fileFromBytes(new TextEncoder().encode(text))), [1]).counts,
    ).toEqual([1])
  })

  it('ファイル読み取りエラーを日本語の入力エラーにする', async () => {
    const file = fileFromBytes(new Uint8Array())
    vi.mocked(file.arrayBuffer).mockRejectedValueOnce(new Error('unreadable'))
    await expect(readTsvFile(file)).rejects.toMatchObject({ code: 'file-read' })
  })
})
