import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { expect, test, type Page } from '@playwright/test'
import { selectShareEncoding } from '../src/codec'
import type { HeatmapDocument } from '../src/domain/series'

declare global {
  var SharingPerformance: typeof import('./sharing-performance-entry')
}
let bundle: string

test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      target: 'es2022',
      lib: {
        entry: fileURLToPath(new URL('./sharing-performance-entry.ts', import.meta.url)),
        formats: ['iife'],
        name: 'SharingPerformance',
      },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  const code = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .find((chunk) => chunk.type === 'chunk' && chunk.isEntry)
  if (!code || code.type !== 'chunk') throw new Error('Benchmark bundle missing')
  bundle = code.code
})

async function markInteraction(page: Page, event: string, selector: string, name: string) {
  await page.evaluate(
    ({ event, selector, name }) => {
      document.querySelector(selector)!.addEventListener(
        event,
        () => {
          performance.mark(`${name}-start`)
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              performance.mark(`${name}-painted`)
              performance.measure(name, `${name}-start`, `${name}-painted`)
            }),
          )
        },
        { capture: true, once: true },
      )
    },
    { event, selector, name },
  )
}

async function duration(page: Page, name: string) {
  await expect
    .poll(() => page.evaluate((name) => performance.getEntriesByName(name).length, name), {
      timeout: 20000,
    })
    .toBe(1)
  return page.evaluate((name) => performance.getEntriesByName(name)[0]!.duration, name)
}

test('3,660日の共有ダイアログ・候補生成・URL復元・閾値変更を計測する', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000)
  const counts = Array.from({ length: 3660 }, (_, i) => i % 1200)
  const source = { kind: 'exact' as const, startDate: '2016-01-01', counts }
  const sampleDocument: HeatmapDocument = {
    source,
    thresholds: { method: 'quantile', boundaries: [100, 200, 400, 600, 800, 1000] },
  }
  await page.goto(`./#/heatmap?d=${selectShareEncoding(sampleDocument, 'exact').d}`)
  await expect(page.locator('[data-date]')).toHaveCount(3660)
  await page.addScriptTag({ content: bundle })
  const candidates = await page.evaluate(() => {
    let state = 123456789n
    const randomCounts = Array.from({ length: 3660 }, () => {
      state = (state * 6364136223846793005n + 1442695040888963407n) % (1n << 53n)
      return Number(state)
    })
    return [
      Array<number>(3660).fill(0),
      Array.from({ length: 3660 }, (_, i) => i % 1200),
      randomCounts,
    ].map((counts, index) => {
      const api = globalThis.SharingPerformance
      const source = { kind: 'exact' as const, startDate: '2016-01-01', counts }
      const thresholds = api.resolveThresholds({ method: 'quantile' }, counts)
      const sample = { source, thresholds }
      const timings = []
      for (let iteration = 0; iteration < 8; iteration++) {
        const start = performance.now()
        const compact = api.selectShareEncoding(sample, 'compact')
        const afterCompact = performance.now()
        const exact = api.selectShareEncoding(sample, 'exact')
        const afterExact = performance.now()
        api.decodeDParameter(compact.d)
        const afterCompactDecode = performance.now()
        api.decodeDParameter(exact.d)
        const afterExactDecode = performance.now()
        api.resolveThresholds({ method: 'log' }, counts)
        const afterThresholds = performance.now()
        if (iteration > 0)
          timings.push({
            compactMs: afterCompact - start,
            exactMs: afterExact - afterCompact,
            compactDecodeMs: afterCompactDecode - afterExact,
            exactDecodeMs: afterExactDecode - afterCompactDecode,
            thresholdsMs: afterThresholds - afterExactDecode,
            compactChars: compact.d.length,
            exactChars: exact.d.length,
          })
      }
      return { distribution: ['all-zero', 'daily-cycle', 'random53'][index], timings }
    })
  })
  const ui = []
  for (let sample = 0; sample < 3; sample++) {
    const name = `dialog-${sample}`
    const trigger = page.getByRole('button', { name: '共有する', exact: true })
    await trigger.scrollIntoViewIfNeeded()
    // イベントcaptureから2フレーム後まで。ダイアログの遷移完了待ちは別に確認する。
    await trigger.evaluate((element) => element.setAttribute('data-performance-trigger', ''))
    await markInteraction(page, 'click', '[data-performance-trigger]', name)
    await trigger.click()
    await expect(page.getByRole('textbox', { name: '生成URLのプレビュー' })).not.toHaveValue('')
    const dialogMs = await duration(page, name)
    const exactName = `exact-${sample}`
    await markInteraction(page, 'change', 'input[value="exact"]', exactName)
    await page.getByRole('radio', { name: '完全データ（正確な件数）', exact: true }).check()
    const exactModeMs = await duration(page, exactName)
    await page.getByRole('button', { name: '閉じる', exact: true }).click()
    const thresholdName = `threshold-${sample}`
    await markInteraction(page, 'change', 'select', thresholdName)
    await page
      .getByRole('combobox', { name: '閾値方式', exact: true })
      .selectOption(sample % 2 ? 'quantile' : 'linear')
    const thresholdMs = await duration(page, thresholdName)
    // 同じコンポーネントを再利用した共有URLへの遷移で、復元から描画まで測る。
    const restoreName = `restore-${sample}`
    const d = selectShareEncoding(
      { ...sampleDocument, thresholds: { method: 'linear', boundaries: [2 + sample] } },
      'exact',
    ).d
    await page.evaluate(
      ({ name, d }) => {
        performance.mark(`${name}-start`)
        const observer = new MutationObserver(() => {
          if (
            !document
              .querySelector('[aria-label="確定した境界値"]')
              ?.textContent?.includes(`${2 + Number(name.split('-')[1])} 件`)
          )
            return
          observer.disconnect()
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              performance.mark(`${name}-painted`)
              performance.measure(name, `${name}-start`, `${name}-painted`)
            }),
          )
        })
        observer.observe(document.body, { subtree: true, childList: true, characterData: true })
        location.hash = `/heatmap?d=${d}`
      },
      { name: restoreName, d },
    )
    const restoreMs = await duration(page, restoreName)
    ui.push({ dialogMs, exactModeMs, thresholdMs, restoreMs })
  }
  const result = {
    project: testInfo.project.name,
    browserVersion: browser.version(),
    viewport: page.viewportSize(),
    devicePixelRatio: await page.evaluate(() => devicePixelRatio),
    cpuThrottling: false,
    ui,
    candidates,
  }
  await testInfo.attach('sharing-performance.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  console.log(`SHARING_PERFORMANCE ${JSON.stringify(result)}`)
})
