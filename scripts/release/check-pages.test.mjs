import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkPages } from './check-pages.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'daily-heatmap-pages-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dist = join(root, 'dist')
  const publicDirectory = join(root, 'public')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  mkdirSync(publicDirectory)
  writeFileSync(join(publicDirectory, 'sample.tsv'), 'Date\tCount\n2026-04-01\t6\n')
  writeFileSync(join(dist, 'sample.tsv'), 'Date\tCount\n2026-04-01\t6\n')
  const html =
    '<link href="/daily-heatmap/assets/app.css"><script src="/daily-heatmap/assets/app.js"></script>'
  writeFileSync(join(dist, 'index.html'), html)
  writeFileSync(join(dist, 'assets/app.css'), 'body {}')
  writeFileSync(join(dist, 'assets/app.js'), 'console.log("fixture")')
  return { dist, publicDirectory, html, verify: () => checkPages(dist, publicDirectory) }
}

test('Pages distribution accepts correct base, assets and public sample', (t) =>
  fixture(t).verify())
test('incorrect root base and external resources fail', (t) => {
  const f = fixture(t)
  for (const path of ['/assets/app.js', 'https://example.invalid/app.js']) {
    writeFileSync(join(f.dist, 'index.html'), f.html.replace('/daily-heatmap/assets/app.js', path))
    assert.throws(f.verify, /base/)
  }
})
test('missing asset or public file and modified sample fail', (t) => {
  const f = fixture(t)
  rmSync(join(f.dist, 'assets/app.js'))
  assert.throws(f.verify, /Missing asset/)
  writeFileSync(join(f.dist, 'assets/app.js'), '')
  writeFileSync(join(f.dist, 'sample.tsv'), 'changed')
  assert.throws(f.verify, /Public file/)
  rmSync(join(f.dist, 'sample.tsv'))
  assert.throws(f.verify, /Missing sample/)
})
test('hidden files and symlinks are rejected', (t) => {
  const f = fixture(t)
  writeFileSync(join(f.dist, '.env'), 'fixture')
  assert.throws(f.verify, /hidden/)
  rmSync(join(f.dist, '.env'))
  symlinkSync(join(f.publicDirectory, 'sample.tsv'), join(f.dist, 'link'))
  assert.throws(f.verify, /symlinks/)
})
