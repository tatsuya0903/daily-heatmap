import { expect, test, type Page } from '@playwright/test'
import {
  decodeDParameter,
  encodeBase64Url,
  encodeDocument,
  MAX_D_PARAMETER_CHARS,
  selectShareEncoding,
} from '../src/codec'
import type { HeatmapDocument } from '../src/domain/series'

const sampleDocument: HeatmapDocument = {
  source: { kind: 'exact', startDate: '2026-04-01', counts: [6, 4, 0, 45] },
  // データから再生成した境界とは異なる値で、復元時の再生成を検出する。
  thresholds: { method: 'linear', boundaries: [3, 10, 20, 30, 40, 50] },
}
const route = (d: string) => `./#/heatmap?d=${d}`
const urlField = (page: Page) => page.getByRole('textbox', { name: '生成URLのプレビュー' })
const method = (page: Page) => page.getByRole('combobox', { name: '閾値方式', exact: true })
const boundaries = (page: Page) => page.getByLabel('確定した境界値', { exact: true })
const detail = (page: Page) => page.getByRole('region', { name: '選択した日付の詳細' })

async function importTsv(page: Page) {
  await page.goto('./')
  await page.getByLabel('TSVファイル', { exact: true }).setInputFiles({
    name: '架空氏名のファイル.tsv',
    mimeType: 'text/tab-separated-values',
    buffer: Buffer.from(
      'Date\t架空列名A\t架空列名B\n2026-04-01\t3\t3\n2026-04-02\t2\t2\n2026-04-04\t21\t24',
    ),
  })
  await page.getByRole('button', { name: '選択した列を読み込む' }).click()
}

async function openShare(page: Page, exact = false) {
  await page.getByRole('button', { name: '共有する', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  if (exact)
    await page.getByRole('radio', { name: '完全データ（正確な件数）', exact: true }).check()
  await expect(urlField(page)).not.toHaveValue('')
  return urlField(page).inputValue()
}

function decodeUrl(url: string) {
  const parsed = new URL(url)
  expect(parsed.search).toBe('')
  expect(parsed.pathname).toBe('/daily-heatmap/')
  expect(parsed.hash.startsWith('#/heatmap?d=')).toBe(true)
  return decodeDParameter(new URLSearchParams(parsed.hash.split('?')[1]).get('d')!)
}

async function snapshot(page: Page) {
  // 閾値変更時のfill遷移が完了した実際の色を比較する。
  await page.locator('.v-heatmap__cell-rect').evaluateAll(async (rects) => {
    await Promise.all(
      rects.flatMap((rect) =>
        rect.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
      ),
    )
  })
  return {
    cells: await page.locator('[data-date]').evaluateAll((cells) =>
      cells.map((cell) => ({
        date: cell.getAttribute('data-date'),
        level: cell.getAttribute('data-level'),
        color: cell.querySelector('.v-heatmap__cell-rect')
          ? getComputedStyle(cell.querySelector('.v-heatmap__cell-rect')!).fill
          : getComputedStyle(cell).backgroundColor,
      })),
    ),
    legend: await page.getByRole('list', { name: 'レベルと件数範囲の凡例' }).innerText(),
    boundaries: await boundaries(page).innerText(),
  }
}

test('TSV→閾値変更→コピー成功→新規タブのコンパクト復元と再共有（外部通信なし）', async ({
  page,
  context,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copied = text
        },
      },
    })
  })
  await importTsv(page)
  await method(page).selectOption('linear')
  const before = await snapshot(page)
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  const url = await openShare(page)
  await expect(
    page.getByRole('radio', { name: '8段階（短いURL・初期選択）', exact: true }),
  ).toBeChecked()
  await expect(page.getByRole('dialog')).toContainText(
    `URL全体：${url.length.toLocaleString('ja-JP')}文字`,
  )
  await expect(page.getByRole('dialog')).toContainText('URLは暗号化されません')
  const decoded = decodeUrl(url)
  expect(JSON.stringify(decoded)).not.toMatch(/架空|tsv|"Date"|"Count"/)
  expect(url).not.toMatch(/架空|tsv|%E6/)
  await expect.poll(() => page.locator('html').getAttribute('data-copied')).toBeNull()
  await page.getByRole('button', { name: 'URLをコピー', exact: true }).click()
  await expect(page.getByText('URLをコピーしました', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-copied', url)
  expect(requests).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath('share-dialog.png'),
    fullPage: false,
    animations: 'disabled',
  })
  const shared = await context.newPage()
  await shared.goto(url)
  await expect(shared.locator('[data-date]')).toHaveCount(4)
  expect(await snapshot(shared)).toEqual(before)
  await shared.locator('[data-date="2026-04-01"]').click()
  await expect(detail(shared).locator('.detail-count')).toHaveText('1〜9件')
  await expect(detail(shared)).not.toContainText('6件（')
  await expect(method(shared)).toBeDisabled()
  await shared.reload()
  await expect(method(shared)).toBeDisabled()
  const reshared = await openShare(shared)
  await expect(
    shared.getByRole('radio', { name: '完全データ（正確な件数）', exact: true }),
  ).toBeDisabled()
  await expect(shared.getByRole('dialog')).toContainText('元TSVを読み込み直してください')
  expect(decodeUrl(reshared)).toEqual(decoded)
  await shared.close()
})

test('完全URLの保存境界・件数を復元し、5方式の変更後に両形式へ再共有する', async ({
  page,
  context,
}) => {
  await page.goto(route(selectShareEncoding(sampleDocument, 'exact').d))
  await expect(method(page)).toHaveValue('linear')
  await expect(boundaries(page)).toContainText('3 / 10 / 20 / 30 / 40 / 50 件')
  await expect(detail(page).locator('.detail-count')).toHaveText('6件')
  for (const value of ['quantile', 'preset', 'log', 'custom', 'linear']) {
    await method(page).selectOption(value)
    await expect(method(page)).toHaveValue(value)
    await expect(detail(page).locator('.detail-count')).toHaveText('6件')
  }
  await method(page).selectOption('preset')
  await page.getByRole('combobox', { name: '固定プリセットID', exact: true }).selectOption('1')
  const exactUrl = await openShare(page, true)
  const expected: HeatmapDocument = {
    ...sampleDocument,
    thresholds: { method: 'preset', presetId: 1, boundaries: [50, 100, 300, 500, 700, 1000] },
  }
  expect(decodeUrl(exactUrl)).toEqual(expected)
  await page.getByRole('radio', { name: '8段階（短いURL・初期選択）', exact: true }).check()
  const compact = decodeUrl(await urlField(page).inputValue())
  expect(compact.thresholds).toEqual(expected.thresholds)
  expect(compact.source).toEqual({ kind: 'levels', startDate: '2026-04-01', levels: [1, 1, 0, 1] })
  const restored = await context.newPage()
  await restored.goto(exactUrl)
  await expect(detail(restored).locator('.detail-count')).toHaveText('6件')
  await expect(method(restored)).toHaveValue('preset')
  await expect(
    restored.getByRole('combobox', { name: '固定プリセットID', exact: true }),
  ).toHaveValue('1')
  await restored.close()
})

for (const clipboard of ['missing', 'rejected'] as const) {
  test(`Clipboard ${clipboard}は成功通知せず、選択可能なURLで手動コピーを案内する`, async ({
    page,
  }) => {
    await page.addInitScript((state) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value:
          state === 'missing'
            ? undefined
            : {
                writeText: async () => {
                  throw new Error('denied')
                },
              },
      })
    }, clipboard)
    await page.goto(route(selectShareEncoding(sampleDocument, 'exact').d))
    const url = await openShare(page)
    await page.getByRole('button', { name: 'URLをコピー', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: '手動でコピー' })).toBeVisible()
    await expect(page.getByText('URLをコピーしました', { exact: true })).toHaveCount(0)
    await expect(urlField(page)).toBeFocused()
    expect(
      await urlField(page).evaluate(
        (element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart,
      ),
    ).toBe(url.length)
    await page.getByRole('button', { name: '閉じる', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(method(page)).toBeEnabled()
  })
}

test('同一画面内の異なるURL・不正URL・戻る進むでデータと選択状態を同期する', async ({ page }) => {
  const exact = selectShareEncoding(sampleDocument, 'exact').d
  const compact = selectShareEncoding(
    { ...sampleDocument, thresholds: { method: 'log', boundaries: [2] } },
    'compact',
  ).d
  await page.goto(route(exact))
  await expect(method(page)).toHaveValue('linear')
  await method(page).selectOption('custom')
  await page.getByLabel('境界値1', { exact: true }).fill('')
  await page.evaluate((d) => {
    location.hash = `/heatmap?d=${d}`
  }, compact)
  await expect(method(page)).toHaveValue('log')
  await expect(method(page)).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.evaluate(() => {
    location.hash = '/heatmap?d=broken'
  })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('[data-date]')).toHaveCount(0)
  await page.goBack()
  await expect(method(page)).toHaveValue('log')
  await page.goBack()
  await expect(method(page)).toHaveValue('linear')
  await expect(detail(page).locator('.detail-count')).toHaveText('6件')
  await page.goForward()
  await expect(method(page)).toBeDisabled()
  await page.evaluate(() => {
    location.hash = '/heatmap'
  })
  await expect(page.getByText('表示するデータがありません', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'トップページへ戻る' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('日々の積み重ねを、')
})

test('TSVのdなし再読み込みは再アップロードを案内し、新TSVは分位点で開始する', async ({ page }) => {
  await page.goto(route(selectShareEncoding(sampleDocument, 'exact').d))
  await page.getByRole('link', { name: '別のTSVを読み込む' }).click()
  await importTsv(page)
  await expect(method(page)).toHaveValue('quantile')
  await page.reload()
  await expect(page.getByText('表示するデータがありません', { exact: true })).toBeVisible()
  await expect(page.locator('[data-date]')).toHaveCount(0)
})

test('重複・空・壊れたCodec・未対応形式・上限超過を部分表示せず拒否する', async ({ page }) => {
  const d = selectShareEncoding(sampleDocument, 'exact').d
  const invalidDate = encodeDocument(sampleDocument, 0x22)
  invalidDate.set([0x7f, 0xff, 0xff], 1)
  const invalidThreshold = encodeDocument(sampleDocument, 0x22)
  invalidThreshold[6] = 99
  const cases = [
    `${d}&d=${d}`,
    '',
    '!',
    `${d}=`,
    d.slice(0, -1),
    encodeBase64Url(new Uint8Array([0xff, 0, 0, 0, 0, 1, 0, 0])),
    encodeBase64Url(new Uint8Array([0x21, 0, 0, 0, 0, 1, 0xff])),
    encodeBase64Url(invalidDate),
    encodeBase64Url(invalidThreshold),
    encodeBase64Url(new Uint8Array([...encodeDocument(sampleDocument, 0x22), 0])),
    'A'.repeat(MAX_D_PARAMETER_CHARS + 1),
  ]
  await page.goto(route(d))
  for (const value of cases) {
    // 巨大URLも実ルートクエリとして処理する。サーバーへは送られない。
    await page.evaluate((value) => {
      location.hash = `/heatmap?d=${value}`
    }, value)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.locator('[data-date]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'トップページへ戻る' })).toBeVisible()
  }
})

test('320pxの長いURL警告は共有を妨げず、フォーカス・ラジオ・Escapeを操作できる', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 })
  const source = {
    kind: 'exact' as const,
    startDate: '2016-01-01',
    counts: Array.from({ length: 3660 }, (_, i) => (i * 7919) % 100003),
  }
  await page.goto(route(selectShareEncoding({ ...sampleDocument, source }, 'exact').d))
  const trigger = page.getByRole('button', { name: '共有する', exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect
    .poll(() => page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)))
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('share-320-top.png'),
    fullPage: false,
    animations: 'disabled',
  })
  const compactRadio = page.getByRole('radio', { name: '8段階（短いURL・初期選択）', exact: true })
  await compactRadio.focus()
  await page.keyboard.press('ArrowDown')
  await expect(
    page.getByRole('radio', { name: '完全データ（正確な件数）', exact: true }),
  ).toBeChecked()
  await expect(page.getByRole('dialog')).toContainText('1,000文字を超えています')
  await expect(page.getByRole('button', { name: 'URLをコピー', exact: true })).toBeEnabled()
  await expect(urlField(page)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await page.keyboard.press('Tab')
  expect(await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement))).toBe(
    true,
  )
  await page.screenshot({
    path: testInfo.outputPath('share-320.png'),
    fullPage: false,
    animations: 'disabled',
  })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
