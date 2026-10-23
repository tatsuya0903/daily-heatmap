import { expect, test, type Page } from '@playwright/test'
import { selectShareEncoding } from '../src/codec'
import type { HeatmapDocument } from '../src/domain/series'
import { showHeatmapDetails } from './helpers/heatmap'

const sampleDocument: HeatmapDocument = {
  source: { kind: 'exact', startDate: '2026-04-01', counts: [6, 0, 45] },
  thresholds: { method: 'linear', boundaries: [3, 10, 20, 30, 40, 50] },
}
const titleInput = (page: Page) =>
  page.getByRole('textbox', { name: 'タイトル（任意）', exact: true })
const urlInput = (page: Page) => page.getByRole('textbox', { name: '生成URLのプレビュー' })
function params(url: string) {
  const hash = new URL(url).hash
  return new URLSearchParams(hash.slice(hash.indexOf('?') + 1))
}
async function openShare(page: Page, mode: 'exact' | 'compact' = 'compact') {
  await showHeatmapDetails(page)
  await page.getByRole('button', { name: '共有する', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page
    .getByRole('radio', {
      name: mode === 'exact' ? '完全データ（正確な件数）' : '8段階（短いURL・初期選択）',
      exact: true,
    })
    .check()
  await expect(urlInput(page)).not.toHaveValue('')
}
async function importTsv(page: Page) {
  await page.goto('./')
  await page.getByLabel('TSVファイル', { exact: true }).setInputFiles({
    name: 'synthetic-title.tsv',
    mimeType: 'text/tab-separated-values',
    buffer: Buffer.from('Date\tCount\n2026-04-01\t6\n2026-04-02\t0\n2026-04-03\t45'),
  })
  await page.getByRole('button', { name: '選択した列を読み込む' }).click()
}

for (const mode of ['compact', 'exact'] as const) {
  test(`${mode}のタイトルをURLへ含め、新規タブ・再読み込み・再共有で引き継ぐ`, async ({
    page,
    context,
  }, testInfo) => {
    await importTsv(page)
    await openShare(page, mode)
    await expect(titleInput(page)).toHaveValue('')
    const originalD = params(await urlInput(page).inputValue()).get('d')
    const title = '読書の記録 📚 & + ? # = % / <メモ>'
    await titleInput(page).fill(`  ${title}  `)
    await expect.poll(async () => params(await urlInput(page).inputValue()).get('t')).toBe(title)
    const url = await urlInput(page).inputValue()
    expect(params(url).get('d')).toBe(originalD)
    expect(new URL(url).search).toBe('')
    await expect(page.getByRole('dialog')).toContainText(
      `URL全体：${url.length.toLocaleString('ja-JP')}文字`,
    )
    const inputBox = await titleInput(page).boundingBox()
    const modesBox = await page.getByRole('radiogroup', { name: '共有方式' }).boundingBox()
    expect(inputBox!.y).toBeLessThan(modesBox!.y)
    await page.screenshot({ path: testInfo.outputPath(`title-${mode}-dialog.png`) })
    const shared = await context.newPage()
    await shared.goto(url)
    await expect(shared.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(shared.locator('[data-date]')).toHaveCount(3)
    await shared.reload()
    await expect(shared.getByRole('heading', { level: 1 })).toHaveText(title)
    await openShare(shared, mode)
    await expect(titleInput(shared)).toHaveValue(title)
    const reshared = await urlInput(shared).inputValue()
    expect(params(reshared).get('t')).toBe(title)
    expect(params(reshared).get('d')).toBe(originalD)
    await titleInput(shared).fill('　 ')
    await expect.poll(async () => params(await urlInput(shared).inputValue()).has('t')).toBe(false)
    expect(params(await urlInput(shared).inputValue()).get('d')).toBe(originalD)
    await shared.getByRole('button', { name: '閉じる', exact: true }).click()
    await expect(shared.getByRole('heading', { level: 1 })).toHaveText('ヒートマップ')
    await shared.close()
    await page.getByRole('button', { name: '閉じる', exact: true }).click()
    await openShare(page, mode)
    await expect(titleInput(page)).toHaveValue(`  ${title}  `)
  })
}

test('tだけの変更・履歴移動で選択日付と編集した閾値を維持する', async ({ page }) => {
  const d = selectShareEncoding(sampleDocument, 'exact').d
  await page.goto(`./#/heatmap?d=${d}&t=before`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('before')
  await page.locator('[data-date="2026-04-03"]').click()
  await showHeatmapDetails(page)
  const method = page.getByRole('combobox', { name: '閾値方式', exact: true })
  await method.selectOption('preset')
  const levels = await page
    .locator('[data-date]')
    .evaluateAll((elements) =>
      elements.map((el) => [el.getAttribute('data-date'), el.getAttribute('data-level')]),
    )
  await page.evaluate((d) => {
    location.hash = `/heatmap?d=${d}&t=after`
  }, d)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('after')
  await expect(method).toHaveValue('preset')
  await expect(page.getByRole('region', { name: '選択した日付の詳細' })).toContainText('2026/04/03')
  await expect(page.getByRole('button', { name: '詳細情報を閉じる', exact: true })).toBeVisible()
  expect(
    await page
      .locator('[data-date]')
      .evaluateAll((elements) =>
        elements.map((el) => [el.getAttribute('data-date'), el.getAttribute('data-level')]),
      ),
  ).toEqual(levels)
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('before')
  await expect(method).toHaveValue('preset')
  await page.goForward()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('after')
  await expect(method).toHaveValue('preset')
})

test('旧URL・空欄・値なし・重複tは既定の見出しで表示し、HTML風のタイトルは実行しない', async ({
  page,
}) => {
  const d = selectShareEncoding(sampleDocument, 'exact').d
  for (const suffix of ['', '&t=', '&t', '&t=%20%E3%80%80', '&t=first&t=second']) {
    await page.goto(`./#/heatmap?d=${d}${suffix}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ヒートマップ')
    await expect(page.locator('[data-date]')).toHaveCount(3)
  }
  const title =
    '<img src=x onerror="window.titleScriptRan=true"><script>window.titleScriptRan=true</script>'
  await page.goto(`./#/heatmap?${new URLSearchParams({ d, t: title })}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  await expect(page.locator('#heatmap-title img, #heatmap-title script')).toHaveCount(0)
  expect(
    await page.evaluate(() => (window as Window & { titleScriptRan?: boolean }).titleScriptRan),
  ).toBeUndefined()
})

test('320pxでも長いタイトルとURLを省略せず扱い、コピー済み通知をタイトル変更で解除する', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copiedTitleUrl = text
        },
      },
    })
  })
  await importTsv(page)
  await openShare(page)
  await titleInput(page).fill('最初のタイトル')
  await expect
    .poll(async () => params(await urlInput(page).inputValue()).get('t'))
    .toBe('最初のタイトル')
  const initialUrl = await urlInput(page).inputValue()
  await page.getByRole('button', { name: 'URLをコピー', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-copied-title-url', initialUrl)
  await expect(page.getByText('URLをコピーしました', { exact: true })).toBeVisible()
  const title = '長いタイトル📚'.repeat(80)
  await titleInput(page).fill(title)
  await expect(page.getByText('URLをコピーしました', { exact: true })).toBeHidden()
  await expect.poll(async () => params(await urlInput(page).inputValue()).get('t')).toBe(title)
  await expect(page.getByRole('dialog')).toContainText('1,000文字を超えています')
  await expect(page.getByRole('button', { name: 'URLをコピー', exact: true })).toBeEnabled()
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await page.screenshot({ path: testInfo.outputPath('title-320-dialog.png') })
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})
