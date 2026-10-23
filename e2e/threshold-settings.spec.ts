import { expect, test, type Page } from '@playwright/test'

async function importCounts(
  page: Page,
  text = 'Date\tA件数\tB件数\n2026-04-01\t0\t0\n2026-04-02\t1\t0\n2026-04-03\t1\t1\n2026-04-04\t1\t2\n2026-04-05\t2\t2\n2026-04-06\t2\t3\n2026-04-07\t3\t3\n2026-04-08\t3500\t3500',
) {
  await page.goto('./')
  await page.getByLabel('TSVファイル', { exact: true }).setInputFiles({
    name: 'synthetic-thresholds.tsv',
    mimeType: 'text/tab-separated-values',
    buffer: Buffer.from(text),
  })
  await page.getByRole('button', { name: '選択した列を読み込む' }).click()
  await page.getByRole('button', { name: '凡例の説明を表示' }).click()
}

const cell = (page: Page, day: string) => page.locator(`[data-date="2026-04-${day}"]`)

async function screenshot(page: Page, path: string) {
  // 全文キャプチャでfixedヘッダーが途中に写らないよう、先頭へ戻す。
  await page.mouse.move(0, 0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path, fullPage: true })
}

test('分位点を初期表示し、5方式とプリセットID変更で即時再分類・選択日維持する', async ({
  page,
  isMobile,
}, testInfo) => {
  await importCounts(page)
  const method = page.getByRole('combobox', { name: '閾値方式', exact: true })
  const confirmed = page.getByLabel('確定した境界値', { exact: true })
  const detail = page.getByRole('region', { name: '選択した日付の詳細' })
  const legend = page.getByRole('list', { name: 'レベルと件数範囲の凡例' })
  await expect(method).toHaveValue('quantile')
  expect((await method.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(confirmed).toContainText('2 / 3 / 4 / 5 / 6 / 7,000 件')
  await expect(cell(page, '01')).toHaveAttribute('data-level', '0')
  await expect(cell(page, '07')).toHaveAttribute('data-level', '6')
  await expect(legend.getByRole('listitem')).toHaveCount(8)
  await cell(page, '07').click()
  await method.selectOption('preset')
  const preset = page.getByRole('combobox', { name: '固定プリセットID', exact: true })
  for (const [id, boundaries, level] of [
    ['0', '2 / 3 / 5 / 10 / 20 / 50 件', '4'],
    ['1', '50 / 100 / 300 / 500 / 700 / 1,000 件', '1'],
    ['2', '100 / 500 / 1,000 / 5,000 / 10,000 / 50,000 件', '1'],
  ]) {
    await preset.selectOption(id!)
    await expect(confirmed).toContainText(boundaries!)
    await expect(cell(page, '07')).toHaveAttribute('data-level', level!)
    await expect(detail).toContainText('2026/04/07（火）')
    await expect(detail.locator('.detail-count')).toHaveText('6件')
  }
  await method.selectOption('linear')
  await expect(confirmed).toContainText('1,001 / 2,001 / 3,001 / 4,001 / 5,001 / 6,001 件')
  await expect(cell(page, '07')).toHaveAttribute('data-level', '1')
  await method.selectOption('log')
  await expect(cell(page, '07')).toHaveAttribute('data-level', '2')
  await expect(detail.locator('.detail-count')).toHaveText('6件')
  await method.selectOption('custom')
  await expect(page.getByLabel('境界値1', { exact: true })).toHaveValue('2')
  await expect(cell(page, '07')).toHaveAttribute('data-level', '4')
  await method.selectOption('quantile')
  await expect(cell(page, '07')).toHaveAttribute('data-level', '6')
  await expect(detail).toContainText('2026/04/07（火）')
  await expect(page.getByTestId(isMobile ? 'mobile-heatmap' : 'desktop-heatmap')).toBeVisible()
  await screenshot(page, testInfo.outputPath('thresholds.png'))
})

test('カスタム入力エラーで正常な表示を維持し、修正時だけ確定する（320px含む）', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await importCounts(page)
  await cell(page, '07').click()
  await page.getByRole('combobox', { name: '閾値方式', exact: true }).selectOption('custom')
  const first = page.getByLabel('境界値1', { exact: true })
  const confirmed = page.getByLabel('確定した境界値', { exact: true })
  for (const input of ['', '3', '2.5', '-1', '2e3', '9007199254740992', '1']) {
    await first.fill(input)
    await expect(page.getByRole('alert')).toContainText('直前の正常な設定で表示を維持')
    await expect(confirmed).toContainText('2 / 3 / 5 / 10 / 20 / 50 件')
    await expect(cell(page, '07')).toHaveAttribute('data-level', '4')
    await expect(first).toHaveAttribute('aria-invalid', 'true')
  }
  await screenshot(page, testInfo.outputPath('custom-error.png'))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const method = page.getByRole('combobox', { name: '閾値方式', exact: true })
  await method.selectOption('linear')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await method.selectOption('custom')
  await expect(page.getByRole('alert')).toContainText('直前の正常な設定で表示を維持')
  await expect(confirmed).toContainText('1,001 / 2,001 / 3,001 / 4,001 / 5,001 / 6,001 件')
  await expect(cell(page, '07')).toHaveAttribute('data-level', '1')
  await first.fill('2')
  await expect(page.getByRole('alert')).toHaveCount(0)
  for (let index = 6; index >= 1; index--) {
    await page.getByLabel(`境界値${index}`, { exact: true }).fill(String(index * 10))
  }
  await expect(confirmed).toContainText('10 / 20 / 30 / 40 / 50 / 60 件')
  await expect(cell(page, '07')).toHaveAttribute('data-level', '1')
  await expect(cell(page, '08')).toHaveAttribute('data-level', '7')
  const detail = page.getByRole('region', { name: '選択した日付の詳細' })
  await expect(detail).toContainText('2026/04/07（火）')
  await expect(cell(page, '07')).toHaveAccessibleName('2026/04/07（火）：6件、1〜9件、レベル1')
  await expect(detail.locator('.detail-count')).toHaveText('6件')
  await screenshot(page, testInfo.outputPath('custom-valid.png'))
  const box = await first.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

for (const count of [0, 8]) {
  test(`全${count}件でも自動方式の空境界・固定定義・8色凡例を維持する`, async ({ page }) => {
    await importCounts(page, `Date\tCount\n2026-04-01\t${count}\n2026-04-02\t${count}`)
    const method = page.getByRole('combobox', { name: '閾値方式', exact: true })
    const confirmed = page.getByLabel('確定した境界値', { exact: true })
    const legend = page.getByRole('list', { name: 'レベルと件数範囲の凡例' })
    for (const value of ['linear', 'quantile', 'log']) {
      await method.selectOption(value)
      await expect(confirmed).toContainText('境界値なし')
      await expect(cell(page, '01')).toHaveAttribute('data-level', count === 0 ? '0' : '1')
      await expect(legend).toContainText('1件以上')
      await expect(
        legend.getByRole('listitem').filter({ hasText: '未使用（範囲なし）' }),
      ).toHaveCount(6)
    }
    for (const value of ['preset', 'custom']) {
      await method.selectOption(value)
      await expect(confirmed).toContainText('2 / 3 / 5 / 10 / 20 / 50 件')
      await expect(legend.getByRole('listitem')).toHaveCount(8)
      await expect(
        legend.getByRole('listitem').filter({ hasText: '未使用（範囲なし）' }),
      ).toHaveCount(0)
    }
  })
}

test('巨大件数と最大安全整数付近でもLogの確定境界を正確に表示する', async ({ page }) => {
  for (const { counts, expected } of [
    {
      counts: [100_000_000_000_000, 200_000_000_000_000],
      expected:
        '110,408,951,367,382 / 121,901,365,420,448 / 134,590,019,263,236 / 148,599,428,913,695 / 164,067,071,201,528 / 181,144,732,852,782 件',
    },
    {
      counts: [Number.MAX_SAFE_INTEGER - 10, Number.MAX_SAFE_INTEGER],
      expected:
        '9,007,199,254,740,983 / 9,007,199,254,740,984 / 9,007,199,254,740,986 / 9,007,199,254,740,987 / 9,007,199,254,740,989 / 9,007,199,254,740,990 件',
    },
  ]) {
    await importCounts(page, `Date\tCount\n2026-04-01\t${counts[0]}\n2026-04-02\t${counts[1]}`)
    await page.getByRole('combobox', { name: '閾値方式', exact: true }).selectOption('log')
    await expect(page.getByLabel('確定した境界値', { exact: true })).toContainText(expected)
    await expect(cell(page, '01')).toHaveAttribute('data-level', '1')
    await expect(cell(page, '02')).toHaveAttribute('data-level', '7')
  }
})
