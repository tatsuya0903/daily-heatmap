import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseDocument } from 'yaml'

function workflow(name) {
  const document = parseDocument(
    readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8'),
    { uniqueKeys: true },
  )
  assert.deepEqual(document.errors, [])
  return document.toJS()
}
const ci = workflow('ci')
const deploy = workflow('deploy')
const readOnly = { contents: 'read' }
const runCommands = (job) => job.steps.filter((step) => step.run).map((step) => step.run)

test('CI runs on all main PR updates including drafts and main push; never tag push', () => {
  assert.deepEqual(ci.on, { pull_request: { branches: ['main'] }, push: { branches: ['main'] } })
  assert.deepEqual(ci.permissions, readOnly)
  assert.deepEqual(Object.keys(ci.jobs).sort(), ['e2e', 'quality'])
  for (const job of Object.values(ci.jobs)) {
    assert.equal(job.needs, undefined)
    assert.equal(job.if, undefined)
    assert.equal(job.strategy, undefined)
    assert.deepEqual(job.permissions ?? ci.permissions, readOnly)
  }
})

test('quality commands do not fix sources and every command fails the job on error', () => {
  assert.deepEqual(runCommands(ci.jobs.quality), [
    'npm ci',
    'npm run type-check',
    'npm run lint',
    'npm run format:check',
    'npm run test:workflows',
    'npm run test:unit',
    'npm run build',
    'npm run check:pages',
  ])
  for (const job of [...Object.values(ci.jobs), ...Object.values(deploy.jobs)]) {
    assert.equal(job['continue-on-error'], undefined)
    for (const step of job.steps) assert.equal(step['continue-on-error'], undefined)
  }
})

test('E2E uses production build and the Playwright webServer; all projects and flaky failure detection', () => {
  assert.deepEqual(runCommands(ci.jobs.e2e), [
    'npm ci',
    'npx playwright install --with-deps chromium firefox webkit',
    'npm run build',
    'npm run test:e2e -- --workers=1 --fail-on-flaky-tests',
  ])
  const config = readFileSync(new URL('../../playwright.config.ts', import.meta.url), 'utf8')
  for (const name of ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari']) {
    assert(config.includes(`name: '${name}'`))
  }
  assert(config.includes('npm run preview -- --host 127.0.0.1 --port 4173 --strictPort'))
  assert(config.includes('reuseExistingServer: !process.env.CI'))
  const artifact = ci.jobs.e2e.steps.at(-1)
  assert.equal(artifact.if, 'failure()')
  assert.equal(artifact.with['retention-days'], 7)
  assert.equal(artifact.with.path, 'playwright-report/\ntest-results/\n')
})

test('deploy is manual only, default-denied publication checkbox, main and repository guarded', () => {
  assert.deepEqual(Object.keys(deploy.on), ['workflow_dispatch'])
  const inputs = deploy.on.workflow_dispatch.inputs
  assert.deepEqual(Object.keys(inputs).sort(), ['publish_approved', 'release_tag'])
  assert.equal(inputs.release_tag.required, true)
  assert.equal(inputs.release_tag.type, 'string')
  assert.equal(inputs.publish_approved.default, false)
  assert.equal(inputs.publish_approved.type, 'boolean')
  assert.equal(inputs.publish_approved.required, true)
  assert.equal(
    deploy.jobs['validate-release'].if.trim(),
    "github.repository == 'tatsuya0903/daily-heatmap' && github.ref == 'refs/heads/main' && inputs.publish_approved",
  )
  assert.deepEqual(deploy.concurrency, { group: 'github-pages', 'cancel-in-progress': false })
})

test('deployment waits for validation and build with only deploy holding publication rights', () => {
  assert.deepEqual(deploy.permissions, readOnly)
  assert.deepEqual(Object.keys(deploy.jobs), ['validate-release', 'build-pages', 'deploy-pages'])
  assert.equal(deploy.jobs['validate-release'].needs, undefined)
  assert.equal(deploy.jobs['build-pages'].needs, 'validate-release')
  assert.deepEqual(deploy.jobs['deploy-pages'].needs, ['validate-release', 'build-pages'])
  assert.deepEqual(deploy.jobs['validate-release'].permissions, {
    contents: 'read',
    actions: 'read',
  })
  assert.deepEqual(deploy.jobs['build-pages'].permissions ?? deploy.permissions, readOnly)
  assert.deepEqual(deploy.jobs['deploy-pages'].permissions, { pages: 'write', 'id-token': 'write' })
  assert.equal(deploy.jobs['deploy-pages'].environment.name, 'github-pages')
  assert.equal(deploy.jobs['deploy-pages'].steps.length, 2)
  assert.equal(deploy.jobs['deploy-pages'].steps[0].with.enablement, false)
})

test('tag input enters process via env; trusted tooling and immutable source SHAs are separated', () => {
  const validate = deploy.jobs['validate-release']
  assert.equal(validate.steps[0].with.ref, '${{ github.sha }}')
  assert.equal(validate.steps.at(-1).run, 'node scripts/release/validate-release.mjs validate')
  assert.equal(validate.steps.at(-1).env.RELEASE_TAG, '${{ inputs.release_tag }}')
  assert.equal(validate.steps.at(-1).env.GITHUB_TOKEN, '${{ github.token }}')
  const build = deploy.jobs['build-pages']
  assert.equal(build.steps[0].with.ref, '${{ github.sha }}')
  assert.equal(build.steps[0].with.path, 'release-tooling')
  assert.equal(build.steps[1].with.ref, '${{ needs.validate-release.outputs.commit }}')
  assert.equal(build.steps[1].with.path, 'release-source')
  assert.equal(
    build.steps[3].run,
    'node release-tooling/scripts/release/validate-release.mjs recheck',
  )
  assert.equal(build.steps[3].env.EXPECTED_COMMIT, '${{ needs.validate-release.outputs.commit }}')
  assert.equal(
    build.steps[3].env.EXPECTED_TAG_OBJECT,
    '${{ needs.validate-release.outputs.tag-object }}',
  )
  assert.equal(build.steps[4].run, 'npm ci')
  assert.equal(build.steps[4]['working-directory'], 'release-source')
  assert.equal(build.steps[5]['working-directory'], 'release-source')
  assert.equal(build.steps.at(-1).with.path, 'release-source/dist')
  for (const job of Object.values(deploy.jobs)) {
    for (const step of job.steps) assert(!step.run?.includes('${{'))
  }
})

const actions = {
  checkout: '3d3c42e5aac5ba805825da76410c181273ba90b1',
  'setup-node': '949feb2413d6458794dcd2491c4babbbce0c15c1',
  'upload-artifact': 'cf430e030ddbb5b0abf93d22962f4752f3646cd9',
  'configure-pages': '45bfe0192ca1faeb007ade9deae92b16b8254a0d',
  'upload-pages-artifact': 'fc324d3547104276b827a68afc52ff2a11cc49c9',
  'deploy-pages': '368f82528645a54fb793d4d04e342629a3f51346',
}
test('all actions are verified official SHA pins; checkout credentials are not persisted', () => {
  for (const workflow of [ci, deploy]) {
    for (const job of Object.values(workflow.jobs)) {
      assert.equal(job['runs-on'], 'ubuntu-24.04')
      for (const step of job.steps.filter((step) => step.uses)) {
        const match = /^actions\/([^@]+)@([a-f0-9]{40})$/.exec(step.uses)
        assert(match, step.uses)
        assert.equal(match[2], actions[match[1]])
        if (match[1] === 'checkout') assert.equal(step.with['persist-credentials'], false)
        if (match[1] === 'setup-node') assert.equal(step.with['node-version'], '24.21.0')
      }
    }
  }
  for (const job of Object.values(ci.jobs)) {
    const setup = job.steps.find((step) => step.uses?.startsWith('actions/setup-node@'))
    assert.equal(setup.with.cache, 'npm')
    assert.equal(setup.with['cache-dependency-path'], 'package-lock.json')
  }
  for (const job of Object.values(deploy.jobs)) {
    for (const step of job.steps.filter((step) => step.uses?.startsWith('actions/setup-node@'))) {
      assert.equal(step.with['package-manager-cache'], false)
    }
  }
})
