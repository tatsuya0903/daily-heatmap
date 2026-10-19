// Investigation only. No application Codec imports or production decoder.
// node docs/issue-7-deflate-probe.mjs <fflate package directory> <pako package directory>
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { arch, cpus, release } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { deflateRawSync, deflateSync, gzipSync, inflateRawSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const fflateDir = resolve(process.argv[2])
const pakoDir = resolve(process.argv[3])
const fflatePackage = JSON.parse(readFileSync(resolve(fflateDir, 'package.json'), 'utf8'))
const pakoPackage = JSON.parse(readFileSync(resolve(pakoDir, 'package.json'), 'utf8'))
assert.equal(fflatePackage.version, '0.8.3')
assert.equal(pakoPackage.version, '3.0.2')
const fflate = require(resolve(fflateDir, 'lib/browser.cjs'))
const pako = await import(pathToFileURL(resolve(pakoDir, 'dist/pako.mjs')).href)
const LIMIT = 40 * 1024
const cases = []
function check(name, run) {
  cases.push({ name, ...run() })
}
const same = (a, b) => assert.deepEqual(Array.from(a), Array.from(b))
const sample = Uint8Array.from({ length: 3660 }, (_, i) => (i * 37 + (i % 19)) % 256)
const raw = fflate.deflateSync(sample, { level: 6, mem: 8 })
const stream = (input, final = true) => {
  const chunks = []
  const flags = []
  new fflate.Inflate((chunk, end) => {
    chunks.push(...chunk)
    flags.push(end)
  }).push(input, final)
  return { chunks, flags }
}

check('raw batch interoperability with independent node:zlib', () => {
  same(fflate.inflateSync(raw), sample)
  same(inflateRawSync(raw), sample)
  same(fflate.inflateSync(deflateRawSync(sample)), sample)
  return { verified: true, compressedBytes: raw.length, outputBytes: sample.length }
})
check('raw API rejects gzip and zlib wrapped samples', () => {
  assert.throws(() => fflate.inflateSync(gzipSync(sample)))
  assert.throws(() => fflate.inflateSync(deflateSync(sample)))
  return { verified: true }
})
for (const tail of [[0], [255], [0, 255], Array.from(raw)]) {
  check(`fflate silently accepts trailing bytes (${tail.length}, first=${tail[0]})`, () => {
    const input = Uint8Array.from([...raw, ...tail])
    same(fflate.inflateSync(input), sample)
    same(stream(input).chunks, sample)
    return { unsafeBehaviorReproduced: true, extraBytes: tail.length }
  })
}
check('every nonempty truncated prefix of sample is rejected', () => {
  for (let size = 1; size < raw.length; size++) {
    assert.throws(() => fflate.inflateSync(raw.subarray(0, size)))
    assert.throws(() => stream(raw.subarray(0, size)))
  }
  return { verified: true, prefixes: raw.length - 1 }
})
check('fflate accepts empty input without a final DEFLATE block', () => {
  same(fflate.inflateSync(new Uint8Array()), [])
  same(stream(new Uint8Array()).chunks, [])
  assert.throws(() => inflateRawSync(new Uint8Array()))
  return { unsafeBehaviorReproduced: true }
})
check('stream callback final flag follows caller, not parsed BFINAL/EOB', () => {
  const result = stream(raw, false)
  same(result.chunks, sample)
  assert.deepEqual(result.flags, [false])
  return { verified: true, flags: result.flags }
})
check('reserved BTYPE=3 rejects even with valid stream following', () => {
  assert.throws(() => fflate.inflateSync(Uint8Array.of(7, ...raw)))
  return { verified: true }
})
check('invalid stored block LEN/NLEN is accepted by fflate', () => {
  // BFINAL=1, BTYPE=0, LEN=1, NLEN=0 (must be 0xfffe), literal A.
  const invalid = Uint8Array.of(1, 1, 0, 0, 0, 65)
  same(fflate.inflateSync(invalid), [65])
  same(stream(invalid).chunks, [65])
  assert.throws(() => inflateRawSync(invalid))
  return { unsafeBehaviorReproduced: true, hex: Buffer.from(invalid).toString('hex') }
})
check('unused bits in last byte are distinct from trailing bytes', () => {
  // Empty fixed-Huffman final block: 10 significant bits, 6 unused bits.
  same(inflateRawSync(Uint8Array.of(3, 252)), [])
  same(fflate.inflateSync(Uint8Array.of(3, 252)), [])
  return { verified: true, significantBits: 10, consumedBytes: 2 }
})
for (const size of [LIMIT, LIMIT + 1, 8 * 1024 * 1024]) {
  check(`fflate out=${LIMIT} for ${size} output bytes`, () => {
    const input = deflateRawSync(new Uint8Array(size))
    const result = fflate.inflateSync(input, { out: new Uint8Array(LIMIT) })
    assert.equal(result.length, LIMIT)
    return {
      unsafeBehaviorReproduced: size > LIMIT,
      compressedBytes: input.length,
      actualOutputBytes: size,
      returnedBytes: result.length,
      error: false,
    }
  })
}
check('fixed output buffer does not stop expansion work at 40KiB', () => {
  let writes = 0
  let beyondLimitWrites = 0
  const output = new Uint8Array(LIMIT)
  // Diagnostic Proxy observes writes without changing fflate source.
  // Bind native methods/getters to the real typed array.
  const diagnosticOutput = new Proxy(output, {
    get(target, key) {
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
    set(target, key, value) {
      if (typeof key === 'string' && /^\d+$/.test(key)) {
        writes++
        if (Number(key) >= LIMIT) beyondLimitWrites++
      }
      return Reflect.set(target, key, value)
    },
  })
  const size = 1024 * 1024
  fflate.inflateSync(deflateRawSync(new Uint8Array(size)), { out: diagnosticOutput })
  assert.equal(writes, size)
  assert.equal(beyondLimitWrites, size - LIMIT)
  return { unsafeBehaviorReproduced: true, writes, beyondLimitWrites }
})
check('stream callback runs after oversized allocation and expansion', () => {
  const allocations = []
  const trackedUint8Array = new Proxy(Uint8Array, {
    construct(target, args) {
      const value = Reflect.construct(target, args)
      allocations.push(value.byteLength)
      return value
    },
  })
  const context = { exports: {}, Uint8Array: trackedUint8Array }
  runInNewContext(readFileSync(resolve(fflateDir, 'lib/browser.cjs'), 'utf8'), context)
  allocations.length = 0
  const size = 8 * 1024 * 1024
  const input = deflateRawSync(new Uint8Array(size))
  const stop = new Error('40KiB callback limit')
  let callbackBytes = 0
  assert.throws(
    () =>
      new context.exports.Inflate((chunk) => {
        callbackBytes = chunk.length
        if (chunk.length > LIMIT) throw stop
      }).push(input, true),
    (error) => error === stop,
  )
  assert.equal(callbackBytes, size)
  assert.ok(Math.max(...allocations) >= size)
  return {
    unsafeBehaviorReproduced: true,
    compressedBytes: input.length,
    firstCallbackBytes: callbackBytes,
    largestAllocationBytes: Math.max(...allocations),
  }
})

// Alternative-library feasibility probe only. Uses pako 3's exported low-level
// API with an exact-size caller-owned output buffer; no production Codec.
function pakoProbe(input) {
  const state = new pako.ZStream()
  assert.equal(pako.zlibInflateInit2(state, -15), pako.Z_OK)
  const output = new Uint8Array(LIMIT)
  state.input = input
  state.next_in = 0
  state.avail_in = input.length
  state.output = output
  state.next_out = 0
  state.avail_out = LIMIT
  try {
    const status = pako.zlibInflate(state, pako.Z_FINISH)
    return {
      status,
      consumed: state.next_in,
      remaining: state.avail_in,
      produced: state.next_out,
      output: output.subarray(0, state.next_out),
    }
  } finally {
    pako.zlibInflateEnd(state)
  }
}
check('pako low-level does not allocate expanding output before stopping', () => {
  const allocations = []
  const context = {
    exports: {},
    Uint8Array: new Proxy(Uint8Array, {
      construct(target, args) {
        const value = Reflect.construct(target, args)
        allocations.push(value.byteLength)
        return value
      },
    }),
  }
  runInNewContext(readFileSync(resolve(pakoDir, 'dist/pako.cjs.js'), 'utf8'), context)
  allocations.length = 0
  const p = context.exports
  const state = new p.ZStream()
  assert.equal(p.zlibInflateInit2(state, -15), p.Z_OK)
  const input = deflateRawSync(new Uint8Array(8 * 1024 * 1024))
  state.input = input
  state.avail_in = input.length
  state.output = new Uint8Array(LIMIT)
  state.avail_out = LIMIT
  try {
    assert.equal(p.zlibInflate(state, p.Z_FINISH), p.Z_BUF_ERROR)
    assert.equal(state.next_out, LIMIT)
    assert.equal(state.next_in, 54)
    assert.ok(allocations.every((size) => size <= LIMIT))
    return {
      feasibilityVerified: true,
      callerOutputBytes: LIMIT,
      largestInternalUint8ArrayBytes: Math.max(0, ...allocations),
      consumed: state.next_in,
      compressedBytes: input.length,
    }
  } finally {
    p.zlibInflateEnd(state)
  }
})
check('pako 3.0.2 low-level raw interoperability', () => {
  const result = pakoProbe(raw)
  assert.equal(result.status, pako.Z_STREAM_END)
  assert.equal(result.consumed, raw.length)
  same(result.output, sample)
  same(inflateRawSync(pako.deflateRaw(sample, { level: 6 })), sample)
  return { feasibilityVerified: true }
})
check('pako low-level distinguishes EOB, unused bits and extra bytes', () => {
  for (const tail of [[], [0], [255], [0, 255], Array.from(raw)]) {
    const result = pakoProbe(Uint8Array.of(3, 252, ...tail))
    assert.equal(result.status, pako.Z_STREAM_END)
    assert.equal(result.consumed, 2)
    assert.equal(result.remaining, tail.length)
  }
  for (const tail of [[0], [255], Array.from(raw)]) {
    const result = pakoProbe(Uint8Array.from([...raw, ...tail]))
    assert.equal(result.status, pako.Z_STREAM_END)
    assert.equal(result.consumed, raw.length)
    assert.equal(result.remaining, tail.length)
  }
  return { feasibilityVerified: true }
})
check('pako low-level rejects truncated and malformed streams', () => {
  for (let size = 0; size < raw.length; size++) {
    assert.notEqual(pakoProbe(raw.subarray(0, size)).status, pako.Z_STREAM_END)
  }
  for (const invalid of [
    Uint8Array.of(7, ...raw),
    Uint8Array.of(1, 1, 0, 0, 0, 65, ...raw),
    gzipSync(sample),
    deflateSync(sample),
  ]) {
    assert.notEqual(pakoProbe(invalid).status, pako.Z_STREAM_END)
  }
  return { feasibilityVerified: true }
})
for (const size of [LIMIT, LIMIT + 1, 8 * 1024 * 1024]) {
  check(`pako low-level exact output capacity for ${size} bytes`, () => {
    const input = deflateRawSync(new Uint8Array(size))
    const result = pakoProbe(input)
    assert.equal(result.produced, LIMIT)
    assert.equal(result.status, size === LIMIT ? pako.Z_STREAM_END : pako.Z_BUF_ERROR)
    // A pending match can consume the last byte before producing all output.
    // Input exhaustion alone is never proof of stream completion.
    if (size > 1024 * 1024) assert.ok(result.consumed < input.length)
    return {
      feasibilityVerified: true,
      compressedBytes: input.length,
      consumed: result.consumed,
      produced: result.produced,
      status: result.status,
      entireStreamProcessed: result.status === pako.Z_STREAM_END,
    }
  })
}

const browserResults = []
if (process.argv.includes('--browsers')) {
  const playwright = require('@playwright/test')
  for (const name of ['chromium', 'firefox', 'webkit']) {
    const browser = await playwright[name].launch()
    try {
      const page = await browser.newPage()
      await page.addScriptTag({ path: resolve(fflateDir, 'umd/index.js') })
      await page.addScriptTag({ path: resolve(pakoDir, 'dist/browser/pako.umd.min.js') })
      const result = await page.evaluate(
        ({ raw, sample, oversized, limit }) => {
          const f = globalThis.fflate
          const p = globalThis.pako
          const compressed = f.deflateSync(Uint8Array.from(sample), { level: 6, mem: 8 })
          const roundtrip = f.inflateSync(compressed)
          const state = new p.ZStream()
          p.zlibInflateInit2(state, -15)
          state.input = Uint8Array.from(oversized)
          state.avail_in = oversized.length
          state.output = new Uint8Array(limit)
          state.avail_out = limit
          const status = p.zlibInflate(state, p.Z_FINISH)
          const result = {
            roundtrip: Array.from(roundtrip),
            deterministicBytes: Array.from(compressed),
            fflateTrailingAccepted: f.inflateSync(Uint8Array.from([...raw, 255])).length,
            fflateOversizeReturned: f.inflateSync(Uint8Array.from(oversized), {
              out: new Uint8Array(limit),
            }).length,
            pakoStatus: status,
            pakoProduced: state.next_out,
            pakoConsumed: state.next_in,
          }
          p.zlibInflateEnd(state)
          return result
        },
        {
          raw: Array.from(raw),
          sample: Array.from(sample),
          oversized: Array.from(deflateRawSync(new Uint8Array(8 * 1024 * 1024))),
          limit: LIMIT,
        },
      )
      same(result.roundtrip, sample)
      same(result.deterministicBytes, raw)
      assert.equal(result.fflateTrailingAccepted, sample.length)
      assert.equal(result.fflateOversizeReturned, LIMIT)
      assert.equal(result.pakoStatus, pako.Z_BUF_ERROR)
      assert.equal(result.pakoProduced, LIMIT)
      assert.equal(result.pakoConsumed, 54)
      browserResults.push({
        browser: name,
        version: browser.version(),
        rawRoundtripAndDeterminism: true,
        fflateSafetyFailuresReproduced: true,
        pakoFixedCapacityStopVerified: true,
      })
    } finally {
      await browser.close()
    }
  }
}

const files = [
  resolve(fflateDir, 'lib/browser.cjs'),
  resolve(fflateDir, 'umd/index.js'),
  resolve(pakoDir, 'dist/pako.mjs'),
  resolve(pakoDir, 'dist/browser/pako.esm.min.mjs'),
]
console.log(
  JSON.stringify(
    {
      environment: {
        node: process.version,
        zlib: process.versions.zlib,
        platform: process.platform,
        release: release(),
        arch: arch(),
        cpu: cpus()[0]?.model,
      },
      libraries: { fflate: fflatePackage.version, pako: pakoPackage.version },
      files: files.map((file) => {
        const data = readFileSync(file)
        return {
          file: file.replace(fflateDir, 'fflate@0.8.3').replace(pakoDir, 'pako@3.0.2'),
          bytes: data.length,
          gzipBytes: gzipSync(data).length,
          sha256: createHash('sha256').update(data).digest('hex'),
        }
      }),
      cases,
      browserResults,
      result: 'fflate public APIs fail the required safety gate; no production adoption',
    },
    null,
    2,
  ),
)
