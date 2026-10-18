import { expect, test, type Locator } from '@playwright/test'

async function selectLast(locator: Locator, mobile: boolean) {
  if (mobile) await locator.tap()
  else await locator.click()
}

// 合成データのみ。Performance APIでアプリ内の描画/応答を測る（Playwrightの通信時間を除外）。
test('3,660日の初期描画・スクロール・日付選択と不要なDOM更新を計測する', async ({
  page,
  isMobile,
  browserName,
  browser,
}, testInfo) => {
  const end = new Date(Date.UTC(2016, 0, 1) + 3659 * 86400000).toISOString().slice(0, 10)
  const rows = Array.from({ length: 3660 }, (_, i) => {
    const date = new Date(Date.UTC(2016, 0, 1) + i * 86400000).toISOString().slice(0, 10)
    return `${date}\t${i === 3659 ? 1153 : i % 1200}`
  })
  const measurements = []
  for (let sample = 0; sample < 3; sample++) {
    await page.goto('./')
    await page.getByLabel('TSVファイル', { exact: true }).setInputFiles({
      name: 'synthetic-3660.tsv',
      mimeType: 'text/tab-separated-values',
      buffer: Buffer.from(`Date\tCount\n${rows.join('\n')}`),
    })
    await page.evaluate(() => {
      document.addEventListener('submit', () => performance.mark('heatmap-start'), {
        once: true,
        capture: true,
      })
      const observer = new MutationObserver(() => {
        if (document.querySelectorAll('[data-cell-index]').length !== 3660) return
        observer.disconnect()
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            performance.mark('heatmap-painted')
            performance.measure('heatmap-initial', 'heatmap-start', 'heatmap-painted')
          }),
        )
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    await page.getByRole('button', { name: '選択した列を読み込む' }).click()
    await expect(page.locator('[data-cell-index]')).toHaveCount(3660)
    await expect
      .poll(() => page.evaluate(() => performance.getEntriesByName('heatmap-initial').length))
      .toBe(1)
    const initialMs = await page.evaluate(
      () => performance.getEntriesByName('heatmap-initial')[0]!.duration,
    )
    const scroll = await page.evaluate(async (mobile) => {
      const scrollElement = mobile
        ? document.scrollingElement!
        : document.querySelector('.heatmap-scroll')!
      const size = mobile
        ? scrollElement.scrollHeight - window.innerHeight
        : scrollElement.scrollWidth - scrollElement.clientWidth
      const frames: number[] = []
      let previous = performance.now()
      for (let i = 0; i < 60; i++) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame((now) => {
            frames.push(now - previous)
            previous = now
            if (mobile) scrollElement.scrollTop = (size * i) / 59
            else scrollElement.scrollLeft = (size * i) / 59
            resolve()
          }),
        )
      }
      return { frames, distance: mobile ? scrollElement.scrollTop : scrollElement.scrollLeft }
    }, isMobile)
    expect(scroll.distance).toBeGreaterThan(0)
    const last = page.locator(`[data-date="${end}"]`)
    await last.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    await page.evaluate((mobile) => {
      const chart = document.querySelector('[data-testid$="-heatmap"]')!
      const observer = new MutationObserver((entries) => {
        // フォーカス移動によるtabindex更新を除き、セル描画の更新を数える。
        const changes = entries.filter(
          (entry) => entry.type === 'childList' || entry.attributeName !== 'tabindex',
        )
        performance.mark(`chart-mutations-${changes.length}`)
      })
      observer.observe(chart, { subtree: true, childList: true, attributes: true })
      chart.addEventListener(
        mobile ? 'pointerdown' : 'mouseover',
        () => {
          performance.mark('heatmap-select-start')
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              performance.mark('heatmap-select-painted')
              performance.measure(
                'heatmap-select',
                'heatmap-select-start',
                'heatmap-select-painted',
              )
              observer.disconnect()
            }),
          )
        },
        { once: true, capture: true },
      )
    }, isMobile)
    await selectLast(last, isMobile)
    await expect(page.getByRole('region', { name: '選択した日付の詳細' })).toContainText('1,153件')
    await expect
      .poll(() => page.evaluate(() => performance.getEntriesByName('heatmap-select').length))
      .toBe(1)
    const dateBox = await page.locator('.detail-date').boundingBox()
    expect(dateBox!.y).toBeGreaterThanOrEqual(72)
    const selection = await page.evaluate(() => ({
      ms: performance.getEntriesByName('heatmap-select')[0]!.duration,
      mutations: performance
        .getEntriesByType('mark')
        .filter((m) => m.name.startsWith('chart-mutations-'))
        .reduce((n, m) => n + Number(m.name.slice('chart-mutations-'.length)), 0),
    }))
    expect(selection.mutations).toBe(0)
    const sorted = scroll.frames.slice(1).sort((a, b) => a - b)
    measurements.push({
      initialMs,
      selectionMs: selection.ms,
      chartMutations: selection.mutations,
      scrollFrameMedianMs: sorted[Math.floor(sorted.length / 2)],
      scrollFrameP95Ms: sorted[Math.floor(sorted.length * 0.95)],
      scrollFrameMaxMs: Math.max(...sorted),
    })
  }
  await testInfo.attach('performance.json', {
    body: JSON.stringify(
      {
        browserName,
        browserVersion: browser.version(),
        viewport: page.viewportSize(),
        isMobile,
        cpuThrottling: false,
        devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
        samples: measurements,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  })
  console.log(`HEATMAP_PERFORMANCE ${testInfo.project.name} ${JSON.stringify(measurements)}`)
  await page.screenshot({ path: testInfo.outputPath('heatmap-3660.png'), fullPage: false })
})
