// node docs/issue-8-bundle.mjs > docs/issue-8-bundle.json
// Compare the same production build/gzip settings against the Issue #7 main.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'vite'

const baseline = '5634907'
const root = process.cwd()
mkdirSync(resolve(root, 'node_modules/.tmp'), { recursive: true })
const temporary = mkdtempSync(resolve(root, 'node_modules/.tmp/issue-8-bundle-'))
async function appBuild(directory) {
  const result = await build({
    root: directory,
    configFile: resolve(directory, 'vite.config.ts'),
    logLevel: 'silent',
    build: { write: false },
  })
  const outputs = Array.isArray(result) ? result : [result]
  const assets = outputs
    .flatMap((output) => output.output)
    .map((asset) => {
      const bytes = Buffer.from(asset.type === 'chunk' ? asset.code : asset.source)
      return { file: asset.fileName, bytes: bytes.length, gzipBytes: gzipSync(bytes).length }
    })
  const total = assets.reduce(
    (total, asset) => ({
      bytes: total.bytes + asset.bytes,
      gzipBytes: total.gzipBytes + asset.gzipBytes,
    }),
    { bytes: 0, gzipBytes: 0 },
  )
  return { assets, total }
}
try {
  const archive = execFileSync('git', ['archive', baseline], { maxBuffer: 20 * 1024 * 1024 })
  execFileSync('tar', ['-x', '-C', temporary], { input: archive })
  symlinkSync(resolve(root, 'node_modules'), resolve(temporary, 'node_modules'), 'dir')
  const before = await appBuild(temporary)
  const after = await appBuild(root)
  console.log(
    JSON.stringify(
      {
        baseline: execFileSync('git', ['rev-parse', baseline], { encoding: 'utf8' }).trim(),
        node: process.version,
        gzip: 'node:zlib gzipSync defaults; each asset compressed separately',
        before,
        after,
        increase: {
          bytes: after.total.bytes - before.total.bytes,
          gzipBytes: after.total.gzipBytes - before.total.gzipBytes,
        },
      },
      null,
      2,
    ),
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
