import { expect, test } from '@playwright/test'

// 実際の個人データを使わず、テスト内で架空のファイルを生成する。
function tsv(text: string, name = 'synthetic.tsv') {
  return { name, mimeType: 'text/tab-separated-values', buffer: Buffer.from(text, 'utf8') }
}

const exampleA = 'Date\tCount\n2026-04-01\t6\n2026-04-02\t4\n2026-04-11\t45'
const exampleB = 'Date\tA件数\tB件数\n2026-04-01\t3\t3\n2026-04-02\t2\t2\n2026-04-11\t21\t24'

test('ファイル選択からBOM・CRLF付きの2列TSVを読み込み、リロード後は再読み込みを案内する', async ({
  page,
}) => {
  await page.goto('./')
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'ファイルを選択' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(
    tsv('\uFEFF' + exampleA.replaceAll('\n', '\r\n') + '\r\n\r\n', 'synthetic.txt'),
  )
  await expect(page.getByRole('checkbox', { name: 'Count', exact: true })).toBeChecked()
  await page.getByRole('button', { name: '選択した列を読み込む' }).click()
  await expect(page).toHaveURL(/#\/heatmap$/)
  await expect(page.getByRole('status')).toContainText('2026-04-01 〜 2026-04-11（11日分）')
  await page.reload()
  await expect(page.getByRole('heading', { name: '表示するデータがありません' })).toBeVisible()
})

test('複数列TSVをドロップし、全列の初期選択から読み込む', async ({ page }) => {
  await page.goto('./')
  const dropArea = page.getByRole('region', { name: 'TSVファイルのドロップ領域' })
  await dropArea.evaluate((element, text) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File([text], 'synthetic.tsv', { type: 'text/tab-separated-values' }))
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
  }, exampleB)
  await expect(page.getByRole('checkbox', { name: 'A件数', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'B件数', exact: true })).toBeChecked()
  await page.getByRole('button', { name: '選択した列を読み込む' }).click()
  await expect(page.getByRole('status')).toContainText('2026-04-01 〜 2026-04-11（11日分）')
})

test('非数値列のエラーに行・列名を示し、その列を除外すれば読み込める', async ({ page }) => {
  await page.goto('./')
  await page
    .getByLabel('TSVファイル', { exact: true })
    .setInputFiles(tsv('Date\tCount\t架空の注記\n2026-01-01\t6\tメモ'))
  await page.getByRole('button', { name: '選択した列を読み込む' }).click()
  await expect(page.getByRole('alert')).toContainText('2行目・3列目・「架空の注記」')
  await expect(page).toHaveURL(/daily-heatmap\/(?:#\/)?$/)
  await page.getByRole('checkbox', { name: '架空の注記', exact: true }).uncheck()
  await page.getByRole('button', { name: '選択した列を読み込む' }).click()
  await expect(page.getByRole('status')).toContainText('2026-01-01 〜 2026-01-01（1日分）')
})

test('件数列が0列なら読み込みを無効にする', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('TSVファイル', { exact: true }).setInputFiles(tsv(exampleB))
  await page.getByRole('checkbox', { name: 'A件数', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: 'B件数', exact: true }).uncheck()
  await expect(page.getByRole('button', { name: '選択した列を読み込む' })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'A件数', exact: true }).check()
  await expect(page.getByRole('button', { name: '選択した列を読み込む' })).toBeEnabled()
  await page.getByRole('button', { name: '選択した列を読み込む' }).click()
  await expect(page.getByRole('heading', { name: 'TSVの読み込みが完了しました' })).toBeVisible()
})

for (const { name, text, error } of [
  {
    name: '重複日',
    text: 'Date\tCount\n2026-01-01\t1\n2026-01-01\t2',
    error: '3行目・1列目・「Date」',
  },
  { name: '不正日付', text: 'Date\tCount\n2026-02-29\t1', error: '2行目・1列目・「Date」' },
  { name: '列数不一致', text: 'Date\tA\tB\n2026-01-01\t1', error: '2行目・3列目・「B」' },
  { name: '3,660日超過', text: 'Date\tCount\n0001-01-01\t1\n9999-12-31\t1', error: '3,660日以内' },
]) {
  test(`${name}を拒否し、ファイルの選び直しで回復する`, async ({ page }) => {
    await page.goto('./')
    const input = page.getByLabel('TSVファイル', { exact: true })
    await input.setInputFiles(tsv(text))
    await expect(page.getByRole('alert')).toContainText(error)
    await expect(page.getByRole('button', { name: '選択した列を読み込む' })).toHaveCount(0)
    await input.setInputFiles(tsv(exampleA))
    await page.getByRole('button', { name: '選択した列を読み込む' }).click()
    await expect(page.getByRole('status')).toContainText('11日分')
  })
}

test('合算超過を拒否し、以前に読み込んだデータを維持する', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('TSVファイル', { exact: true }).setInputFiles(tsv(exampleA))
  await page.getByRole('button', { name: '選択した列を読み込む' }).click()
  await expect(page.getByRole('status')).toContainText('11日分')
  await page.getByRole('link', { name: '別のTSVを読み込む' }).click()
  await page
    .getByLabel('TSVファイル', { exact: true })
    .setInputFiles(tsv('Date\tA\tB\n2026-01-01\t9007199254740991\t1'))
  await page.getByRole('button', { name: '選択した列を読み込む' }).click()
  await expect(page.getByRole('alert')).toContainText('2行目・3列目・「B」')
  await expect(page.getByRole('alert')).toContainText('2026-01-01')
  await page.goBack()
  await expect(page.getByRole('status')).toContainText('2026-04-01 〜 2026-04-11（11日分）')
})

test('2MiB超過を拒否する', async ({ page }) => {
  await page.goto('./')
  await page
    .getByLabel('TSVファイル', { exact: true })
    .setInputFiles(tsv('x'.repeat(2 * 1024 * 1024 + 1)))
  await expect(page.getByRole('alert')).toContainText('2MiB')
  await expect(page.getByRole('button', { name: '選択した列を読み込む' })).toHaveCount(0)
})
