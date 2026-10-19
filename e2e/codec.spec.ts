import { constants, deflateRawSync, deflateSync, gzipSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { buildCodecBundle } from './codec-bundle'
import type { HeatmapDocument } from '../src/domain/series'

type Codec = typeof import('./codec-entry')
declare global {
  var CodecForTests: Codec
}

let bundle: string

test.beforeAll(async () => {
  bundle = await buildCodecBundle()
})

test.beforeEach(async ({ page }) => {
  await page.addScriptTag({ content: bundle })
})

test('6形式の最大日数・安全整数・確定境界と最短候補をブラウザーで保持する', async ({ page }) => {
  const result = await page.evaluate(() => {
    const c = globalThis.CodecForTests
    const document: HeatmapDocument = {
      source: {
        kind: 'exact',
        startDate: '1999-12-31',
        counts: Array.from({ length: 3660 }, (_, i) =>
          i % 7 === 0 ? Number.MAX_SAFE_INTEGER : i % 100,
        ),
      },
      thresholds: { method: 'quantile', boundaries: [2, 7, 131] },
    }
    const roundtrips = Object.values(c.FORMAT_IDS).map((format) => {
      const plainFormat = format % 2 === 1 ? format - 1 : format
      const expected = c.decodeDocument(
        c.encodeDocument(document, plainFormat as 0x20 | 0x22 | 0x24),
      )
      const restored = c.decodeDParameter(c.encodeDParameter(document, format))
      return { format, equal: JSON.stringify(restored) === JSON.stringify(expected) }
    })
    const selection = (['compact', 'exact'] as const).map((mode) => {
      const formats =
        mode === 'compact' ? ([0x20, 0x21] as const) : ([0x22, 0x23, 0x24, 0x25] as const)
      const selected = c.selectShareEncoding(document, mode)
      return {
        validLength: selected.length === selected.d.length,
        minimum:
          selected.length ===
          Math.min(...formats.map((f) => c.encodeDParameter(document, f).length)),
        deterministic:
          JSON.stringify(selected) === JSON.stringify(c.selectShareEncoding(document, mode)),
      }
    })
    const compact = c.decodeDParameter(c.selectShareEncoding(document, 'compact').d)
    let exactRejected = false
    try {
      c.selectShareEncoding(compact, 'exact')
    } catch (error) {
      exactRejected = error instanceof c.CodecError
    }
    return { roundtrips, selection, exactRejected }
  })
  expect(result.roundtrips.map((r) => r.equal)).toEqual(Array<boolean>(6).fill(true))
  expect(result.selection).toEqual(
    Array(2).fill({ validLength: true, minimum: true, deterministic: true }),
  )
  expect(result.exactRejected).toBe(true)
})

test('3圧縮形式のGoldenをブラウザーでも完全一致させる', async ({ page }) => {
  const result = await page.evaluate(() => {
    const c = globalThis.CodecForTests
    return ['IQAAAAAIY2BktSwHAA', 'IwAAAAAEY2BgZi0AAA', 'JQAAAAAFY2BiqG9g_A8B_AwA'].map((d) => {
      const document = c.decodeDParameter(d)
      const format = c.decodeBase64Url(d)[0] as 0x21 | 0x23 | 0x25
      return c.encodeDParameter(document, format)
    })
  })
  expect(result).toEqual(['IQAAAAAIY2BktSwHAA', 'IwAAAAAEY2BgZi0AAA', 'JQAAAAAFY2BiqG9g_A8B_AwA'])
})

test('切断・余剰00/ff/別ストリーム・不正LEN/NLEN・gzip/zlibを拒否する', async ({ page }) => {
  const raw = deflateRawSync(Uint8Array.of(0, 1, 0))
  const invalid = [
    [],
    [7],
    [1, 1, 0, 0, 0, 65],
    [1, 1, 0, 0, 0, 65, ...raw],
    [...gzipSync(Uint8Array.of(0, 1, 0))],
    [...deflateSync(Uint8Array.of(0, 1, 0))],
    ...Array.from({ length: raw.length }, (_, i) => [...raw.subarray(0, i)]),
    ...[[0], [255], [0, 255], [...raw]].map((tail) => [...raw, ...tail]),
  ]
  const result = await page.evaluate((inputs) => {
    const c = globalThis.CodecForTests
    return inputs.flatMap((input) =>
      [0x21, 0x23, 0x25].map((format) => {
        try {
          c.decodeDocument(Uint8Array.of(format, 0, 0, 0, 0, 1, ...input))
          return false
        } catch (error) {
          return error instanceof c.CodecError
        }
      }),
    )
  }, invalid)
  expect(result).toEqual(Array<boolean>(invalid.length * 3).fill(true))
})

test('stored/fixed/dynamicの40KiB境界と高圧縮率の過大展開を検査する', async ({ page }) => {
  const fixtures = [{ level: 0 }, { strategy: constants.Z_FIXED }, { level: 6 }].flatMap(
    (options) =>
      [40960, 40961].map((size) => ({
        size,
        input: [...deflateRawSync(new Uint8Array(size), options)],
      })),
  )
  fixtures.push({
    size: 8 * 1024 * 1024,
    input: [...deflateRawSync(new Uint8Array(8 * 1024 * 1024))],
  })
  const result = await page.evaluate((inputs) => {
    const c = globalThis.CodecForTests
    return inputs.map(({ input }) => {
      try {
        return c.inflateBody(Uint8Array.from(input)).length
      } catch (error) {
        return error instanceof c.CodecError ? error.code : 'unexpected'
      }
    })
  }, fixtures)
  expect(result).toEqual([40960, 'size', 40960, 'size', 40960, 'size', 'size'])
})

test('未使用DEFLATEビットを許容し、ヘッダーと展開後metadataを検証する', async ({ page }) => {
  const badMetadata = [...deflateRawSync(Uint8Array.of(255, 0, 0))]
  const result = await page.evaluate((body) => {
    const c = globalThis.CodecForTests
    const failures = [
      Uint8Array.of(0x21, 0, 0, 0, 0, 0, 7),
      Uint8Array.of(0x21, 127, 255, 255, 0, 1, 7),
      Uint8Array.of(0x21, 0, 0, 0, 0, 1, ...body),
    ].map((bytes) => {
      try {
        c.decodeDocument(bytes)
        return 'accepted'
      } catch (error) {
        return error instanceof c.CodecError ? error.code : 'unexpected'
      }
    })
    let oversize = false
    try {
      c.decodeDParameter('A'.repeat(65537))
    } catch (error) {
      oversize = error instanceof c.CodecError && error.code === 'size'
    }
    return { unusedBits: c.inflateBody(Uint8Array.of(3, 252)).length, failures, oversize }
  }, badMetadata)
  expect(result).toEqual({
    unusedBits: 0,
    failures: ['header', 'date', 'thresholds'],
    oversize: true,
  })
})
