import { expect, test } from '@playwright/test'

test('Pagesのベースパスでトップを開ける', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('Daily Heatmap')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('日々の積み重ねを、')
  await expect(page.getByRole('button', { name: 'ファイルを選択' })).toBeDisabled()
  await expect(page.getByRole('main')).toBeVisible()
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
