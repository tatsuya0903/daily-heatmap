// Production preview must already be running. Synthetic data only; run serially.
// node docs/issue-9-render-benchmark.mjs --label before --samples 20 --warmup 3
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInThisContext } from 'node:vm'
import { arch, cpus, release, totalmem } from 'node:os'
import { build } from 'vite'
import { chromium, firefox, webkit } from '@playwright/test'

const args = Object.fromEntries(
  Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) => [
    process.argv[2 + i * 2].slice(2),
    process.argv[3 + i * 2],
  ]),
)
const output = resolve(args.output ?? '/private/tmp/daily-heatmap-issue-9')
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
      name: 'RenderBenchmarkApi',
    },
  },
})
runInThisContext(
  (Array.isArray(built) ? built : [built])
    .flatMap((x) => x.output)
    .find((x) => x.type === 'chunk' && x.isEntry).code,
)
const api = globalThis.RenderBenchmarkApi
const base = 'http://127.0.0.1:4173/daily-heatmap/'
const samples = Number(args.samples ?? 20)
const warmup = Number(args.warmup ?? 3)
const label = args.label ?? 'current'
const result = {
  label,
  environment: {
    productionAssets: [
      ...readFileSync(resolve('dist/index.html'), 'utf8').matchAll(
        /(?:src|href)="([^"]+\.(?:js|css))"/g,
      ),
    ].map((match) => match[1]),
    cpu: cpus()[0].model,
    arch: arch(),
    os: release(),
    memoryGiB: totalmem() / 2 ** 30,
    node: process.version,
    viewport: { width: 1280, height: 720 },
    cpuThrottling: false,
    samples,
    warmup,
  },
  cases: [],
}
const stats = (values) => {
  const s = [...values].sort((a, b) => a - b)
  return {
    n: s.length,
    medianMs: (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2,
    p95Ms: s[Math.ceil(s.length * 0.95) - 1],
    maxMs: s.at(-1),
  }
}
// Observe DOM completion in the browser. Then measure both two frames and completed
// finite cell transitions + two frames. Neither claims to be a compositor paint timestamp.
async function arm(page, name, days, expectedMethod, trigger) {
  await page.evaluate(
    ({ name, days, expectedMethod, trigger }) => {
      const start = () => {
        performance.mark(name + '-start')
        const t = performance.now()
        globalThis.renderMeasure = { name, domMs: null, twoFrameMs: null, readyMs: null }
        const observer = new MutationObserver(() => {
          const cells = document.querySelectorAll('[data-date]')
          if (cells.length !== days || document.querySelector('select')?.value !== expectedMethod)
            return
          observer.disconnect()
          renderMeasure.domMs = performance.now() - t
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              renderMeasure.twoFrameMs = performance.now() - t
              performance.mark(name + '-two-frame')
              void finish()
            }),
          )
          async function finish() {
            await Promise.all(
              [...document.querySelectorAll('[data-testid$="-heatmap"]')]
                .flatMap((el) => el.getAnimations({ subtree: true }))
                .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
                .map((a) => a.finished.catch(() => undefined)),
            )
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                renderMeasure.readyMs = performance.now() - t
                performance.mark(name + '-end')
              }),
            )
          }
        })
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        })
      }
      if (trigger === 'submit')
        document.addEventListener('submit', start, { once: true, capture: true })
      else if (trigger === 'change')
        document
          .querySelector('select')
          .addEventListener('change', start, { once: true, capture: true })
      else {
        start()
        location.hash = '/heatmap?d=' + trigger
      }
    },
    { name, days, expectedMethod, trigger },
  )
}
async function collect(page) {
  await page.waitForFunction(
    () =>
      globalThis.renderMeasure?.readyMs !== null && globalThis.renderMeasure?.twoFrameMs !== null,
  )
  return page.evaluate(() => ({
    ...renderMeasure,
    cells: document.querySelectorAll('[data-date]').length,
  }))
}
for (const name of (args.browsers ?? 'chromium,firefox,webkit').split(',')) {
  const browser = await { chromium, firefox, webkit }[name].launch()
  const context = await browser.newContext({ viewport: result.environment.viewport })
  for (const days of (args.days ?? '201,365,3660').split(',').map(Number)) {
    const source = {
      kind: 'exact',
      startDate: '2016-01-01',
      counts: Array.from({ length: days }, (_, i) => i % 1200),
    }
    const d = api.selectShareEncoding(
      { source, thresholds: { method: 'linear', boundaries: [2] } },
      'exact',
    ).d
    const tsv =
      'Date\tCount\n' +
      source.counts
        .map(
          (v, i) =>
            new Date(Date.UTC(2016, 0, 1) + i * 86400000).toISOString().slice(0, 10) + '\t' + v,
        )
        .join('\n')
    const rows = []
    for (let i = -warmup; i < samples; i++) {
      const page = await context.newPage()
      await page.goto(base)
      await page.getByLabel('TSVファイル', { exact: true }).setInputFiles({
        name: 'synthetic.tsv',
        mimeType: 'text/tab-separated-values',
        buffer: Buffer.from(tsv),
      })
      let cdp
      const traceEvents = []
      if (args.trace === '1' && name === 'chromium' && i === 0) {
        cdp = await context.newCDPSession(page)
        cdp.on('Tracing.dataCollected', ({ value }) => traceEvents.push(...value))
        await cdp.send('Tracing.start', {
          categories:
            'devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.cpu_profiler,disabled-by-default-devtools.timeline.stack',
          transferMode: 'ReportEvents',
        })
      }
      await arm(page, 'render-initial', days, 'quantile', 'submit')
      await page.getByRole('button', { name: '選択した列を読み込む' }).click()
      const initial = await collect(page)
      await arm(page, 'render-threshold', days, 'preset', 'change')
      await page.getByRole('combobox', { name: '閾値方式', exact: true }).selectOption('preset')
      const threshold = await collect(page)
      await arm(page, 'render-url', days, 'linear', d)
      const url = await collect(page)
      if (cdp) {
        const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve))
        await cdp.send('Tracing.end')
        await complete
        writeFileSync(
          resolve(output, `${label}-${name}-${days}.trace.json`),
          JSON.stringify({ traceEvents }),
        )
      }
      for (const row of [initial, threshold, url])
        if (row.cells !== days) throw new Error('Missing dates')
      if (i >= 0) rows.push(initial, threshold, url)
      await page.close()
    }
    result.cases.push({
      browser: name,
      version: browser.version(),
      days,
      summary: Object.fromEntries(
        ['initial', 'threshold', 'url'].map((scenario) => [
          scenario,
          Object.fromEntries(
            ['domMs', 'twoFrameMs', 'readyMs'].map((metric) => [
              metric,
              stats(rows.filter((x) => x.name === 'render-' + scenario).map((x) => x[metric])),
            ]),
          ),
        ]),
      ),
      rows,
    })
    writeFileSync(resolve(output, `${label}-render.json`), JSON.stringify(result, null, 2) + '\n')
    console.log(`${label} ${name} ${days} complete`)
  }
  await browser.close()
}
