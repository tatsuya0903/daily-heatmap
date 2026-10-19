// Reproducible synthetic-only benchmark of the minified production Codec.
// node docs/issue-7-performance.mjs [--browsers] > docs/issue-7-performance.json
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { arch, cpus, release } from 'node:os'
import { resolve } from 'node:path'
import { runInThisContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { build } from 'vite'

const BASE = 'a5a93d5ccb27ebd3333e9b0776bec8a87a03e6d8'
const root = process.cwd()
mkdirSync(resolve(root, 'node_modules/.tmp'), { recursive: true })
const baselineRoot = mkdtempSync(resolve(root, 'node_modules/.tmp/issue-7-benchmark-'))
const flatten = (result) => (Array.isArray(result) ? result : [result]).flatMap((r) => r.output)
async function codecBuild(directory) {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root: directory,
    build: {
      write: false,
      target: 'es2022',
      minify: true,
      lib: {
        entry: resolve(directory, 'src/codec/index.ts'),
        formats: ['iife'],
        name: 'CodecPerformance',
      },
    },
  })
  return flatten(result).find((r) => r.type === 'chunk' && r.isEntry).code
}
async function appBuild(directory) {
  const result = await build({
    root: directory,
    configFile: resolve(directory, 'vite.config.ts'),
    logLevel: 'silent',
    build: { write: false },
  })
  return flatten(result).map((r) => {
    const bytes = Buffer.from(r.type === 'chunk' ? r.code : r.source)
    return { file: r.fileName, bytes: bytes.length, gzipBytes: gzipSync(bytes).length }
  })
}
function measure({ codec = globalThis.CodecPerformance, iterations = 30, warmup = 5, batch = 1 }) {
  const MAX = Number.MAX_SAFE_INTEGER
  const length = 3660
  let state = 123456789n
  const random53 = Array.from({ length }, (_, i) => {
    state = (state * 6364136223846793005n + 1442695040888963407n) % (1n << 53n)
    return i === 0 ? MAX : i === length - 1 ? 0 : Number(state)
  })
  const distributions = [
    { name: 'all-zero', counts: Array(length).fill(0) },
    { name: 'daily-cycle-0-1199', counts: Array.from({ length }, (_, i) => i % 1200) },
    {
      name: 'sparse-max-safe',
      counts: Array.from({ length }, (_, i) => (i % 183 === 0 ? MAX : 0)),
    },
    { name: 'random-53-bit', counts: random53 },
    {
      name: 'small-skewed',
      counts: Array.from({ length }, (_, i) => (i % 5 === 0 ? 0 : 2 ** (i % 8))),
    },
  ]
  const timing = (run) => {
    for (let i = 0; i < warmup * batch; i++) run()
    const times = []
    for (let i = 0; i < iterations; i++) {
      const start = performance.now()
      for (let call = 0; call < batch; call++) run()
      times.push((performance.now() - start) / batch)
    }
    times.sort((a, b) => a - b)
    return {
      medianMs: times[Math.floor(times.length / 2)],
      p95Ms: times[Math.ceil(times.length * 0.95) - 1],
      minMs: times[0],
      maxMs: times.at(-1),
    }
  }
  return distributions.map(({ name, counts }) => {
    const document = {
      source: { kind: 'exact', startDate: '1999-12-31', counts },
      thresholds: { method: 'quantile', boundaries: [2, 7, 131] },
    }
    const formats = Object.values(codec.FORMAT_IDS).map((format) => {
      const bytes = codec.encodeDocument(document, format)
      const d = codec.encodeDParameter(document, format)
      const rawFormat = format % 2 === 1 ? format - 1 : format
      const rawBodyBytes = codec.encodeDocument(document, rawFormat).length - 6
      return {
        format,
        binaryBytes: bytes.length,
        bodyBytes: bytes.length - 6,
        rawBodyBytes,
        bodyRatio: (bytes.length - 6) / rawBodyBytes,
        base64UrlChars: d.length,
        encode: timing(() => codec.encodeDocument(document, format)),
        encodeDParameter: timing(() => codec.encodeDParameter(document, format)),
        ...(format % 2 === 1 ? { decode: timing(() => codec.decodeDocument(bytes)) } : {}),
      }
    })
    const selection = ['compact', 'exact'].map((mode) => ({
      mode,
      ...codec.selectShareEncoding(document, mode),
      timing: timing(() => codec.selectShareEncoding(document, mode)),
    }))
    console.error(`measured ${name}`)
    return {
      name,
      dayCount: length,
      formats,
      selection: selection.map(({ d: _d, ...rest }) => rest),
    }
  })
}

try {
  execFileSync('tar', ['-x', '-C', baselineRoot], {
    input: execFileSync('git', ['archive', BASE], { cwd: root }),
  })
  const beforeCodec = await codecBuild(baselineRoot)
  const afterCodec = await codecBuild(root)
  const beforeApp = await appBuild(baselineRoot)
  const afterApp = await appBuild(root)
  const size = (code) => ({ bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code).length })
  const before = size(beforeCodec),
    after = size(afterCodec)
  // Evaluate trusted, locally built code in the ordinary Node realm, avoiding
  // the intrinsic-access overhead of a VM sandbox in the actual timing.
  const codec = runInThisContext(`${afterCodec}\nCodecPerformance`)
  const iterations = 30,
    warmup = 5
  const node = measure({ codec, iterations, warmup })
  const browsers = []
  if (process.argv.includes('--browsers')) {
    const playwright = await import('@playwright/test')
    for (const name of ['chromium', 'firefox', 'webkit']) {
      const browser = await playwright[name].launch()
      try {
        const page = await browser.newPage()
        await page.addScriptTag({ content: afterCodec })
        // Average 10 calls per sample to reduce browser timer quantization.
        const results = await page.evaluate(measure, { iterations, warmup, batch: 10 })
        browsers.push({ name, version: browser.version(), results })
        console.error(`measured browser ${name}`)
      } finally {
        await browser.close()
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        environment: {
          date: '2026-10-20',
          timezone: 'Asia/Tokyo',
          node: process.version,
          platform: process.platform,
          release: release(),
          arch: arch(),
          cpu: cpus()[0]?.model,
        },
        settings: {
          baselineCommit: BASE,
          pako: '3.0.2',
          level: 6,
          windowBits: 15,
          memLevel: 8,
          strategy: 0,
          iterations,
          warmup,
          nodeBatch: 1,
          browserBatch: 10,
          unit: 'milliseconds',
          entry: 'src/codec/index.ts',
          target: 'es2022',
          minified: true,
          parallelBenchmarks: false,
        },
        bundle: {
          app: { before: beforeApp, after: afterApp },
          codec: {
            before,
            after,
            delta: {
              bytes: after.bytes - before.bytes,
              gzipBytes: after.gzipBytes - before.gzipBytes,
            },
          },
          note: 'The SPA does not import the Codec until Issue #8. The separately bundled Codec measures all public exports; shared-code effects of future integration are not included.',
        },
        node,
        browsers,
      },
      null,
      2,
    ),
  )
} finally {
  rmSync(baselineRoot, { recursive: true, force: true })
}
