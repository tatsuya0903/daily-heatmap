import assert from 'node:assert/strict'
import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function files(directory, prefix = '') {
  return readdirSync(directory).flatMap((name) => {
    const relative = join(prefix, name)
    const info = lstatSync(join(directory, name))
    assert(!info.isSymbolicLink(), 'Pages distribution must not contain symlinks')
    assert(!name.startsWith('.'), 'Pages distribution must not contain hidden files')
    return info.isDirectory() ? files(join(directory, name), relative) : [relative]
  })
}

export function checkPages(dist = 'dist', publicDirectory = 'public') {
  const distribution = files(dist)
  assert(distribution.includes('index.html'), 'Missing index.html')
  assert(distribution.includes('sample.tsv'), 'Missing sample.tsv')
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1])
  assert(
    references.some((ref) => ref.endsWith('.js')),
    'Missing JS entry',
  )
  assert(
    references.some((ref) => ref.endsWith('.css')),
    'Missing CSS entry',
  )
  for (const ref of references) {
    assert(ref.startsWith('/daily-heatmap/'), `Incorrect Pages asset base: ${ref}`)
    const relative = ref.slice('/daily-heatmap/'.length)
    assert(distribution.includes(relative), `Missing asset: ${relative}`)
  }
  for (const name of files(publicDirectory)) {
    assert.deepEqual(
      readFileSync(join(dist, name)),
      readFileSync(join(publicDirectory, name)),
      `Public file changed/missing: ${name}`,
    )
  }
  console.log(`Pages distribution verified: ${distribution.length} files; base /daily-heatmap/`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkPages(process.argv[2], process.argv[3])
}
