import { expect, test, type Page } from '@playwright/test'

test('Pagesのベースパスでトップを開ける', async ({ page, request }) => {
  const failedResources: string[] = []
  page.on('requestfailed', (request) => failedResources.push(request.url()))
  page.on('response', (response) => {
    if (response.status() >= 400) failedResources.push(response.url())
  })
  const response = await page.goto('./')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle('Daily Heatmap')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('日々の積み重ねを、')
  await expect(page.getByRole('button', { name: 'ファイルを選択' })).toBeEnabled()
  await expect(page.getByRole('main')).toBeVisible()
  const sample = await request.get('./sample.tsv')
  expect(sample.status()).toBe(200)
  expect(await sample.text()).toContain('Date\tA件数\tB件数\tC件数')
  expect(failedResources).toEqual([])
})

test('Hash URLへ直接アクセスしてリロード後もトップに戻れる', async ({ page }) => {
  await page.goto('./#/heatmap')
  await expect(page.getByRole('heading', { name: '表示するデータがありません' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '表示するデータがありません' })).toBeVisible()
  await page.getByRole('link', { name: 'トップページへ戻る' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('日々の積み重ねを、')
})

test('不明な画面から復帰できる', async ({ page }) => {
  await page.goto('./#/unknown-page')
  await expect(page.getByRole('heading', { name: 'ページを開けませんでした' })).toBeVisible()
  await page.getByRole('link', { name: 'トップページへ戻る' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('日々の積み重ねを、')
})

const skipLinkInputs = [
  {
    name: 'クリック',
    activate: async (page: Page) => {
      const skipLink = page.getByRole('link', { name: '本文へ移動' })
      // フォーカス時に現れるリンクを、マウスでクリックする。
      await skipLink.focus()
      await skipLink.click()
    },
  },
  {
    name: 'Enter',
    activate: async (page: Page) => {
      await page.keyboard.press('Tab')
      await expect(page.getByRole('link', { name: '本文へ移動' })).toBeFocused()
      await page.keyboard.press('Enter')
    },
  },
]

for (const { name, path, title } of [
  { name: 'トップ', path: './', title: '日々の積み重ねを、' },
  { name: 'ヒートマップ', path: './#/heatmap?source=skip-link', title: 'ヒートマップ' },
]) {
  for (const { name: input, activate } of skipLinkInputs) {
    test(`${name}のスキップリンクを${input}で操作してもルートが変わらない`, async ({ page }) => {
      await page.goto(path)
      const heading = page.getByRole('heading', { level: 1 })
      await expect(heading).toContainText(title)
      const currentUrl = page.url()
      await activate(page)

      await expect(page.getByRole('main')).toBeFocused()
      await expect(page).toHaveURL(currentUrl)
      await expect(heading).toContainText(title)
    })
  }
}
