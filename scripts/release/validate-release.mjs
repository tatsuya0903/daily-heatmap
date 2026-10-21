import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const repository = 'tatsuya0903/daily-heatmap'

export function validateTagName(tag) {
  if (
    typeof tag !== 'string' ||
    tag.length > 128 ||
    /\s/.test(tag) ||
    !/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag)
  ) {
    throw new Error('Release tag must be vX.Y.Z (stable SemVer, no leading zeroes)')
  }
  return tag
}

function git(directory, ...args) {
  try {
    return execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
    }).trim()
  } catch {
    // Do not echo untrusted Git data or credentials into workflow commands/logs.
    throw new Error('Release Git verification failed')
  }
}

export function validateRelease({ directory, tag, expectedCommit, expectedTagObject }) {
  validateTagName(tag)
  if (Boolean(expectedCommit) !== Boolean(expectedTagObject)) {
    throw new Error('Both expected SHAs are required')
  }
  for (const sha of [expectedCommit, expectedTagObject].filter(Boolean)) {
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid expected SHA')
  }
  // Fetch only the exact remote refs; a local tag/branch with the same name cannot win.
  git(
    directory,
    'fetch',
    '--no-tags',
    'origin',
    '+refs/heads/main:refs/remotes/origin/main',
    `+refs/tags/${tag}:refs/release-validation/tag`,
  )
  const tagObject = git(directory, 'rev-parse', '--verify', 'refs/release-validation/tag')
  const commit = git(directory, 'rev-parse', '--verify', 'refs/release-validation/tag^{commit}')
  if (expectedCommit && (commit !== expectedCommit || tagObject !== expectedTagObject)) {
    throw new Error('Release tag moved since validation')
  }
  git(directory, 'merge-base', '--is-ancestor', commit, 'refs/remotes/origin/main')
  const manifest = JSON.parse(git(directory, 'show', `${commit}:package.json`))
  if (manifest.version !== tag.slice(1)) throw new Error('Tag/package version mismatch')
  if (expectedCommit && git(directory, 'rev-parse', '--verify', 'HEAD') !== expectedCommit) {
    throw new Error('Build checkout does not match validated commit')
  }
  return { commit, tagObject, version: manifest.version }
}

export async function verifySuccessfulCI(commit, token, request = fetch) {
  if (!token) throw new Error('CI verification requires GITHUB_TOKEN')
  const query = new URLSearchParams({
    branch: 'main',
    event: 'push',
    head_sha: commit,
    per_page: '1',
  })
  const response = await request(
    `https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs?${query}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2026-03-10',
      },
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    },
  )
  if (!response.ok) throw new Error('Cannot verify CI run')
  const { workflow_runs: runs } = await response.json()
  const run = runs?.[0]
  if (
    run?.head_sha !== commit ||
    run?.head_branch !== 'main' ||
    run?.event !== 'push' ||
    // REST responses may include the workflow ref; accept only these exact main forms.
    !['.github/workflows/ci.yml', '.github/workflows/ci.yml@main'].includes(run?.path) ||
    run?.repository?.full_name !== repository ||
    run?.head_repository?.full_name !== repository ||
    run?.status !== 'completed' ||
    run?.conclusion !== 'success' ||
    !Number.isSafeInteger(run?.id) ||
    run.id <= 0
  ) {
    throw new Error('The tagged commit requires a successful main push CI run')
  }
  return run.id
}

async function main() {
  const mode = process.argv[2]
  if (
    !['validate', 'recheck'].includes(mode) ||
    process.env.GITHUB_REPOSITORY !== repository ||
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
  ) {
    throw new Error('Release must be dispatched from this repository main workflow')
  }
  if (mode === 'recheck' && (!process.env.EXPECTED_COMMIT || !process.env.EXPECTED_TAG_OBJECT)) {
    throw new Error('Recheck requires validated SHAs')
  }
  const result = validateRelease({
    directory: process.env.RELEASE_DIRECTORY ?? '.',
    tag: process.env.RELEASE_TAG,
    expectedCommit: mode === 'recheck' ? process.env.EXPECTED_COMMIT : undefined,
    expectedTagObject: mode === 'recheck' ? process.env.EXPECTED_TAG_OBJECT : undefined,
  })
  if (mode === 'validate') {
    const ciRun = await verifySuccessfulCI(result.commit, process.env.GITHUB_TOKEN)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `commit=${result.commit}\ntag-object=${result.tagObject}\nci-run=${ciRun}\n`,
    )
    console.log(`Verified main push CI run ${ciRun}`)
  }
  console.log(`Verified release tag object ${result.tagObject}`)
  console.log(`Verified release commit ${result.commit}, package ${result.version}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error(
      'Release validation failed; check tag, version, main ancestry, SHAs and CI result',
    )
    process.exitCode = 1
  })
}
