// Run serially against an already-built production preview; synthetic data only.
// node docs/issue-8-dialog-benchmark.mjs --label before --samples 30 --warmup 5
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInThisContext } from 'node:vm'
import { arch, cpus, release } from 'node:os'
import { build } from 'vite'
import { chromium, firefox, webkit } from '@playwright/test'

const options = Object.fromEntries(
  Array.from({ length: Math.floor((process.argv.length - 2) / 2) }, (_, i) => [
    process.argv[2 + i * 2].slice(2),
    process.argv[3 + i * 2],
  ]),
)
const samples = Number(options.samples ?? 30)
const warmup = Number(options.warmup ?? 5)
const label = options.label ?? 'current'
const base = options.base ?? 'http://127.0.0.1:4173/daily-heatmap/'
const output = resolve(options.output ?? '/private/tmp/daily-heatmap-issue-8-investigation')
mkdirSync(output, { recursive: true })
const built = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    minify: true,
    target: 'es2022',
    lib: {
      entry: resolve('e2e/sharing-performance-entry.ts'),
      formats: ['iife'],
      name: 'DialogBenchmarkApi',
    },
  },
})
const code = (Array.isArray(built) ? built : [built])
  .flatMap((x) => x.output)
  .find((x) => x.type === 'chunk' && x.isEntry).code
runInThisContext(code)
const api = globalThis.DialogBenchmarkApi
const results = {
  label,
  environment: {
    cpu: cpus()[0].model,
    arch: arch(),
    release: release(),
    node: process.version,
    viewport: { width: 1280, height: 720 },
    samples,
    warmup,
    cpuThrottling: false,
  },
  cases: [],
}
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return {
    n: sorted.length,
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maxMs: sorted.at(-1),
    minMs: sorted[0],
  }
}
async function open(page, name) {
  const button = page.getByRole('button', { name: '共有する', exact: true })
  await button.scrollIntoViewIfNeeded()
  await button.evaluate((el, name) => {
    el.addEventListener(
      'click',
      () => {
        performance.mark(name + '-start')
        const start = performance.now()
        const data = {
          name,
          start,
          domMs: null,
          twoFrameMs: null,
          readyMs: null,
          heatmapMutations: 0,
        }
        globalThis.activeDialogMeasure = data
        const observer = new MutationObserver(() => {
          const dialog = document.querySelector('[role="dialog"]')
          if (!dialog?.querySelector('textarea')?.value) return
          data.domMs = performance.now() - start
          observer.disconnect()
        })
        const focused = (event) => {
          const dialog = document.querySelector('[role="dialog"]')
          if (!dialog?.contains(event.target)) return
          document.removeEventListener('focusin', focused)
          data.focusMs = performance.now() - start
          requestAnimationFrame(async () => {
            await Promise.all(
              dialog
                .getAnimations({ subtree: true })
                .filter((animation) =>
                  Number.isFinite(animation.effect?.getComputedTiming().endTime),
                )
                .map((animation) => animation.finished.catch(() => undefined)),
            )
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                data.readyMs = performance.now() - start
              }),
            )
          })
        }
        document.addEventListener('focusin', focused)
        observer.observe(document.body, { subtree: true, childList: true })
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            data.twoFrameMs = performance.now() - start
            performance.mark(name + '-end')
          }),
        )
      },
      { capture: true, once: true },
    )
  }, name)
  await button.click()
  try {
    await page.waitForFunction(
      (name) =>
        globalThis.activeDialogMeasure?.name === name &&
        activeDialogMeasure.readyMs !== null &&
        activeDialogMeasure.twoFrameMs !== null,
      name,
      { timeout: 30000 },
    )
  } catch (error) {
    console.log(
      await page.evaluate(() => ({
        data: globalThis.activeDialogMeasure,
        dialogs: [...document.querySelectorAll('[role=dialog]')].map((el) => ({
          tag: el.tagName,
          text: el.querySelector('textarea')?.value,
          animations: el.getAnimations({ subtree: true }).map((a) => ({
            state: a.playState,
            timing: a.effect.getTiming(),
            target: a.effect.target?.className,
          })),
        })),
      })),
    )
    throw error
  }
  return page.evaluate(() => {
    const d = activeDialogMeasure
    const end = d.start + d.readyMs
    const overlap = (x) =>
      Math.max(0, Math.min(x.start + x.duration, end) - Math.max(x.start, d.start))
    return {
      ...d,
      longTaskMaxMs: Math.max(
        0,
        ...probe.tasks.filter((x) => overlap(x) > 0).map((x) => x.duration),
      ),
      longTaskOverlapMs: probe.tasks.reduce((n, x) => n + overlap(x), 0),
      heartbeatGapMaxMs: Math.max(
        0,
        ...probe.beats.filter((x) => overlap(x) > 0).map((x) => x.duration),
      ),
      cellCount: document.querySelectorAll('[data-date]').length,
      focusInside: !!document.querySelector('[role="dialog"]')?.contains(document.activeElement),
    }
  })
}
async function close(page) {
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
}
for (const name of (options.browsers ?? 'chromium,firefox,webkit').split(',')) {
  const browser = await { chromium, firefox, webkit }[name].launch()
  const context = await browser.newContext({ viewport: results.environment.viewport })
  for (const days of (options.days ?? '201,3660').split(',').map(Number)) {
    const source = {
      kind: 'exact',
      startDate: '2016-01-01',
      counts: Array.from({ length: days }, (_, i) => i % 1200),
    }
    const sample = {
      source,
      thresholds: { method: 'quantile', boundaries: [100, 200, 400, 600, 800, 1000] },
    }
    const url = base + '#/heatmap?d=' + api.selectShareEncoding(sample, 'exact').d
    const next = api.selectShareEncoding(
      { ...sample, thresholds: { method: 'linear', boundaries: [2] } },
      'exact',
    ).d
    const rows = []
    for (let iteration = -warmup; iteration < samples; iteration++) {
      const page = await context.newPage()
      await page.goto(url)
      await page.locator('[data-date]').last().waitFor()
      await page.evaluate(() => {
        globalThis.probe = { tasks: [], beats: [] }
        if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
          new PerformanceObserver((list) =>
            probe.tasks.push(
              ...list.getEntries().map((x) => ({ start: x.startTime, duration: x.duration })),
            ),
          ).observe({ type: 'longtask' })
        let previous = performance.now()
        setInterval(() => {
          const now = performance.now()
          probe.beats.push({ start: previous, duration: now - previous })
          previous = now
        }, 20)
        new MutationObserver((entries) => {
          if (globalThis.activeDialogMeasure) activeDialogMeasure.heatmapMutations += entries.length
        }).observe(document.querySelector('[data-testid="desktop-heatmap"]'), {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        })
      })
      results.environment.longTaskApi ??= {}
      results.environment.longTaskApi[name] = await page.evaluate(() =>
        PerformanceObserver.supportedEntryTypes.includes('longtask'),
      )
      let cdp
      const traceEvents = []
      if (options.trace === '1' && name === 'chromium' && iteration === 0) {
        cdp = await context.newCDPSession(page)
        cdp.on('Tracing.dataCollected', ({ value }) => traceEvents.push(...value))
        await cdp.send('Tracing.start', {
          categories:
            'devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.cpu_profiler,disabled-by-default-devtools.timeline.stack',
          transferMode: 'ReportEvents',
        })
      }
      const values = []
      for (const scenario of ['initial', 'reopen', 'threshold', 'url']) {
        let updateMs = null
        if (scenario === 'threshold') {
          await page.getByRole('combobox', { name: '閾値方式', exact: true }).evaluate((el) =>
            el.addEventListener('change', () => performance.mark('threshold-start'), {
              capture: true,
              once: true,
            }),
          )
          await page.getByRole('combobox', { name: '閾値方式', exact: true }).selectOption('linear')
          updateMs = await page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() =>
                    resolve(
                      performance.now() -
                        performance.getEntriesByName('threshold-start')[0].startTime,
                    ),
                  ),
                ),
              ),
          )
        }
        if (scenario === 'url') {
          updateMs = await page.evaluate(
            (d) =>
              new Promise((resolve) => {
                const start = performance.now()
                const observer = new MutationObserver(() => {
                  if (
                    !document
                      .querySelector('[aria-label="確定した境界値"]')
                      ?.textContent.includes('2 件')
                  )
                    return
                  observer.disconnect()
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve(performance.now() - start)),
                  )
                })
                observer.observe(document.body, {
                  subtree: true,
                  childList: true,
                  characterData: true,
                })
                location.hash = '/heatmap?d=' + d
              }),
            next,
          )
        }
        const row = await open(page, `dialog-${iteration}-${scenario}`)
        if (row.cellCount !== days || !row.focusInside)
          throw new Error('Calendar/focus contract failed')
        values.push({ scenario, updateMs, ...row })
        await close(page)
      }
      if (cdp) {
        const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve))
        await cdp.send('Tracing.end')
        await complete
        writeFileSync(
          resolve(output, `${label}-${name}-${days}.trace.json`),
          JSON.stringify({ traceEvents }),
        )
      }
      await page.close()
      if (iteration >= 0) rows.push(...values)
      console.log(
        JSON.stringify({
          label,
          browser: name,
          days,
          iteration,
          durations: values.map((x) => [
            x.scenario,
            Math.round(x.twoFrameMs),
            Math.round(x.readyMs),
          ]),
        }),
      )
    }
    const summary = Object.fromEntries(
      ['initial', 'reopen', 'threshold', 'url'].map((scenario) => {
        const selected = rows.filter((x) => x.scenario === scenario)
        return [
          scenario,
          Object.fromEntries(
            ['domMs', 'twoFrameMs', 'readyMs', 'heartbeatGapMaxMs', 'longTaskMaxMs'].map(
              (metric) => [metric, stats(selected.map((x) => x[metric]))],
            ),
          ),
        ]
      }),
    )
    results.cases.push({ browser: name, version: browser.version(), days, summary, rows })
    writeFileSync(resolve(output, `${label}-matrix.json`), JSON.stringify(results, null, 2) + '\n')
  }
  await browser.close()
}
