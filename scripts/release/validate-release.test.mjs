import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  repository,
  validateRelease,
  validateTagName,
  verifySuccessfulCI,
} from './validate-release.mjs'

// Isolated temporary repositories only. Never creates tags in the application repository.
const root = mkdtempSync(join(tmpdir(), 'daily-heatmap-release-'))
after(() => rmSync(root, { recursive: true, force: true }))
let fixtureId = 0
function fixture() {
  const remote = join(root, `remote-${fixtureId}`)
  const local = join(root, `local-${fixtureId++}`)
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: local,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' })
  execFileSync('git', ['clone', remote, local], { stdio: 'ignore' })
  git('config', 'user.name', 'Release fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('checkout', '-b', 'main')
  function commit(version) {
    writeFileSync(join(local, 'package.json'), JSON.stringify({ version }))
    git('add', 'package.json')
    git('commit', '-m', `fixture ${version}`)
    return git('rev-parse', 'HEAD')
  }
  const first = commit('0.1.0')
  git('push', 'origin', 'main')
  const verify = (tag = 'v0.1.0', expected = {}) =>
    validateRelease({ directory: local, tag, ...expected })
  return { git, local, remote, commit, first, verify }
}

for (const tag of ['v0.1.0', 'v10.20.30', 'v0.0.0']) {
  test(`accept tag ${tag}`, () => assert.equal(validateTagName(tag), tag))
}
for (const tag of [
  '',
  '0.1.0',
  'v01.1.0',
  'v1.01.0',
  'v1.0.01',
  'v1.0.0-rc.1',
  'v1.0.0+build',
  'v1.0',
  'main',
  'refs/tags/v0.1.0',
  '--help',
  'v0.1.0\n',
  'v0.1.0 ',
  'v0.1.0;touch /tmp/injection',
  '$(touch /tmp/injection)',
  '${{ github.token }}',
]) {
  test(`reject tag ${JSON.stringify(tag)}`, () => assert.throws(() => validateTagName(tag)))
}

test('lightweight remote tag; package comes from tag, not newer main; rollback allowed', () => {
  const f = fixture()
  f.git('tag', 'v0.1.0', f.first)
  f.git('push', 'origin', 'refs/tags/v0.1.0')
  f.commit('0.2.0')
  f.git('push', 'origin', 'main')
  assert.deepEqual(f.verify(), { commit: f.first, tagObject: f.first, version: '0.1.0' })
})

test('annotated remote tag peels to commit and retains tag object', () => {
  const f = fixture()
  f.git('tag', '-a', 'v0.1.0', '-m', 'fixture')
  const object = f.git('rev-parse', 'refs/tags/v0.1.0')
  f.git('push', 'origin', 'refs/tags/v0.1.0')
  assert.notEqual(object, f.first)
  assert.deepEqual(f.verify(), { commit: f.first, tagObject: object, version: '0.1.0' })
  assert.equal(
    f.verify('v0.1.0', { expectedCommit: f.first, expectedTagObject: object }).commit,
    f.first,
  )
})

test('local-only tag and missing remote tag fail', () => {
  const f = fixture()
  f.git('tag', 'v0.1.0')
  assert.throws(() => f.verify())
  assert.throws(() => f.verify('v9.9.9'))
})

test('branch with tag-like name cannot substitute for a tag', () => {
  const f = fixture()
  f.git('push', 'origin', 'HEAD:refs/heads/v0.1.0')
  assert.throws(() => f.verify())
})

test('package mismatch and malformed manifest fail', () => {
  const f = fixture()
  f.git('tag', 'v1.0.0')
  f.git('push', 'origin', 'refs/tags/v1.0.0')
  assert.throws(() => f.verify('v1.0.0'), /version mismatch/)
  writeFileSync(join(f.local, 'package.json'), '{bad json')
  f.git('commit', '-am', 'invalid manifest')
  f.git('tag', 'v0.1.0')
  f.git('push', 'origin', 'main', 'refs/tags/v0.1.0')
  assert.throws(() => f.verify())
})

test('commit outside main history fails', () => {
  const f = fixture()
  f.git('checkout', '-b', 'unreviewed')
  f.commit('0.2.0')
  f.git('tag', 'v0.2.0')
  f.git('push', 'origin', 'refs/tags/v0.2.0')
  assert.throws(() => f.verify('v0.2.0'))
})

test('tag pointing to blob fails commit resolution', () => {
  const f = fixture()
  f.git('tag', 'v0.1.0', f.git('rev-parse', 'HEAD:package.json'))
  f.git('push', 'origin', 'refs/tags/v0.1.0')
  assert.throws(() => f.verify())
})

test('moved tag, changed annotation, missing tag, wrong checkout and malformed SHAs fail', () => {
  const f = fixture()
  f.git('tag', 'v0.1.0')
  f.git('push', 'origin', 'refs/tags/v0.1.0')
  const expected = { expectedCommit: f.first, expectedTagObject: f.first }
  assert.equal(f.verify('v0.1.0', expected).commit, f.first)
  f.git('tag', '-fa', 'v0.1.0', '-m', 'changed object, same commit')
  f.git('push', '--force', 'origin', 'refs/tags/v0.1.0')
  assert.throws(() => f.verify('v0.1.0', expected), /tag moved/)
  f.git('tag', '-f', 'v0.1.0', f.first)
  f.git('push', '--force', 'origin', 'refs/tags/v0.1.0')
  f.commit('0.2.0')
  assert.throws(() => f.verify('v0.1.0', expected), /checkout/)
  f.git('tag', '-f', 'v0.1.0')
  f.git('push', '--force', 'origin', 'refs/tags/v0.1.0')
  assert.throws(() => f.verify('v0.1.0', expected), /tag moved/)
  f.git('push', 'origin', ':refs/tags/v0.1.0')
  assert.throws(() => f.verify('v0.1.0', expected))
  assert.throws(() => f.verify('v0.1.0', { expectedCommit: f.first }), /Both/)
  assert.throws(
    () => f.verify('v0.1.0', { expectedCommit: 'main', expectedTagObject: 'main' }),
    /SHA/,
  )
})

const commit = 'a'.repeat(40)
const successfulRun = {
  id: 123,
  head_sha: commit,
  head_branch: 'main',
  event: 'push',
  path: '.github/workflows/ci.yml',
  head_repository: { full_name: repository },
  status: 'completed',
  conclusion: 'success',
}
const response = (runs) => async () => ({ ok: true, json: async () => ({ workflow_runs: runs }) })
test('successful exact main push CI run is required; request is scoped to exact SHA', async () => {
  const id = await verifySuccessfulCI(commit, 'fixture-token', async (url, options) => {
    const parsed = new URL(url)
    assert.equal(parsed.searchParams.get('head_sha'), commit)
    assert.equal(parsed.searchParams.get('branch'), 'main')
    assert.equal(parsed.searchParams.get('event'), 'push')
    assert.equal(parsed.searchParams.get('per_page'), '1')
    assert.equal(options.redirect, 'error')
    return response([successfulRun])()
  })
  assert.equal(id, 123)
})
for (const patch of [
  { conclusion: 'failure' },
  { conclusion: 'cancelled' },
  { conclusion: 'skipped' },
  { status: 'in_progress' },
  { head_sha: 'b'.repeat(40) },
  { head_branch: 'other' },
  { event: 'pull_request' },
  { path: '.github/workflows/other.yml' },
  { head_repository: { full_name: 'other/repo' } },
  { id: 'unsafe\nvalue' },
]) {
  test(`CI result rejects ${JSON.stringify(patch)}`, async () => {
    await assert.rejects(
      verifySuccessfulCI(commit, 'fixture-token', response([{ ...successfulRun, ...patch }])),
    )
  })
}
test('missing CI/token, API denial and network failures fail closed', async () => {
  await assert.rejects(verifySuccessfulCI(commit, '', response([successfulRun])))
  await assert.rejects(verifySuccessfulCI(commit, 'fixture-token', response([])))
  await assert.rejects(verifySuccessfulCI(commit, 'fixture-token', async () => ({ ok: false })))
  await assert.rejects(
    verifySuccessfulCI(commit, 'fixture-token', async () => {
      throw new Error('network')
    }),
  )
})

test('CLI rejects invalid input and non-main/non-dispatch execution before npm/build', () => {
  const script = new URL('./validate-release.mjs', import.meta.url).pathname
  const env = {
    ...process.env,
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    RELEASE_TAG: 'v0.1.0;echo injected',
  }
  for (const patch of [
    {},
    { RELEASE_TAG: 'v0.1.0', GITHUB_REF: 'refs/heads/other' },
    { RELEASE_TAG: 'v0.1.0', GITHUB_REF: 'refs/tags/v0.1.0' },
    { RELEASE_TAG: 'v0.1.0', GITHUB_EVENT_NAME: 'push' },
    { RELEASE_TAG: 'v0.1.0', GITHUB_REPOSITORY: 'other/repo' },
  ]) {
    assert.throws(
      () =>
        execFileSync(process.execPath, [script, 'validate'], {
          env: { ...env, ...patch },
          stdio: 'pipe',
        }),
      (error) => error.status === 1 && !error.stdout.toString().includes('injected'),
    )
  }
  assert.throws(() => execFileSync(process.execPath, [script, 'recheck'], { env, stdio: 'pipe' }))
})
