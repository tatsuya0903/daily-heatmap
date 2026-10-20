import { expect, test, type Page, type Locator } from '@playwright/test'

async function importData(page: Page, text: string) {
  await page.goto('./')
  await page.getByLabel('TSVファイル', { exact: true }).setInputFiles({
    name: 'synthetic.tsv',
    mimeType: 'text/tab-separated-values',
    buffer: Buffer.from(text),
  })
  await page.getByRole('button', { name: '選択した列を読み込む' }).click()
}

async function inspectDate(locator: Locator, mobile: boolean) {
  if (mobile) await locator.tap()
  else await locator.hover()
}

async function tabIntoCalendar(page: Page) {
  // 共有・閾値・PCスクロール領域を通る。OSによるTab対象の差にも対応する。
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press('Tab')
    if (
      await page
        .locator('[data-cell-index="0"]')
        .evaluate((cell) => cell === document.activeElement)
    )
      return
  }
}

function dateCell(page: Page, date: string) {
  return page.locator(`[data-date="${date}"]`)
}

test('年跨ぎの日曜始まり・日本語見出し・0件と余白・詳細をPCとスマホで確認する', async ({
  page,
  isMobile,
}, testInfo) => {
  await importData(page, 'Date\tCount\n2023-12-30\t49\n2024-01-02\t0\n2024-01-03\t1000')
  const calendar = page.getByTestId(isMobile ? 'mobile-heatmap' : 'desktop-heatmap')
  await expect(calendar).toBeVisible()
  await expect(calendar.locator('[data-cell-index]')).toHaveCount(5)
  await expect(calendar.getByText('2023年12月', { exact: true })).toBeVisible()
  await expect(calendar.getByText('2024年1月', { exact: true })).toBeVisible()
  await expect(dateCell(page, '2023-12-29')).toHaveCount(0)
  await expect(dateCell(page, '2024-01-04')).toHaveCount(0)
  await expect(dateCell(page, '2023-12-31')).toHaveAttribute('data-weekday', '0')
  await expect(dateCell(page, '2024-01-01')).toHaveAttribute('data-weekday', '1')
  await expect(dateCell(page, '2024-01-01')).toHaveAttribute('data-level', '0')
  await expect(dateCell(page, '2024-01-02')).toHaveAttribute('data-level', '0')
  const box = await dateCell(page, '2024-01-01').boundingBox()
  const next = await dateCell(page, '2024-01-02').boundingBox()
  expect(box).not.toBeNull()
  expect(next).not.toBeNull()
  expect(next![isMobile ? 'x' : 'y']).toBeGreaterThan(box![isMobile ? 'x' : 'y'])
  expect(next![isMobile ? 'y' : 'x']).toBe(box![isMobile ? 'y' : 'x'])
  expect(box!.height).toBeGreaterThanOrEqual(isMobile ? 44 : 24)
  await inspectDate(dateCell(page, '2024-01-03'), isMobile)
  await inspectDate(page.getByRole('heading', { level: 1 }), isMobile)
  await page.screenshot({ path: testInfo.outputPath('heatmap.png'), fullPage: true })
  const detail = page.getByRole('region', { name: '選択した日付の詳細' })
  await expect(detail).toContainText('2024/01/03（水）')
  await expect(detail).toContainText('1,000件')
  await expect(detail).toContainText('レベル2 ・ 1,000件以上')
  await expect(dateCell(page, '2024-01-03')).toHaveAccessibleName(
    '2024/01/03（水）：1,000件、1,000件以上、レベル2',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('Tab・矢印・Home/End・Enter/Spaceで日付にアクセスでき、フォーカスが見える', async ({
  page,
  isMobile,
}) => {
  await importData(page, 'Date\tCount\n2024-02-28\t0\n2024-03-08\t1153')
  const detail = page.getByRole('region', { name: '選択した日付の詳細' })
  // 本文のスキップリンクを起点に、キーボードだけでセルへ移動する。
  await page.getByRole('link', { name: '本文へ移動' }).focus()
  await page.keyboard.press('Enter')
  await tabIntoCalendar(page)
  await expect(dateCell(page, '2024-02-28')).toBeFocused()
  await page.keyboard.press(isMobile ? 'ArrowRight' : 'ArrowDown')
  await expect(dateCell(page, '2024-02-29')).toBeFocused()
  await expect(detail).toContainText('2024/02/29（木）')
  const focusStyle = await dateCell(page, '2024-02-29').evaluate((el) => {
    const focused = el.querySelector('.v-heatmap__cell-rect') ?? el
    const style = getComputedStyle(focused)
    return { outline: style.outlineWidth, stroke: style.strokeWidth }
  })
  expect(isMobile ? focusStyle.outline : focusStyle.stroke).toBe('3px')
  await page.keyboard.press(isMobile ? 'ArrowDown' : 'ArrowRight')
  await expect(dateCell(page, '2024-03-07')).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')
  await expect(detail).toContainText('1,153件')
  await expect(detail).toContainText('レベル1')
  await page.keyboard.press('Home')
  await expect(dateCell(page, '2024-02-28')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(dateCell(page, '2024-02-28')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-cell-index]:focus')).toHaveCount(0)
  await expect(page.locator('[data-cell-index][tabindex="0"]')).toHaveCount(1)
})

for (const { date, weekday } of [
  { date: '0001-01-01', weekday: '1' },
  { date: '0099-12-31', weekday: '4' },
  { date: '0100-01-01', weekday: '5' },
  { date: '9999-12-31', weekday: '5' },
]) {
  test(`${date}の1日だけの期間を余白セルなしで描画する`, async ({ page }) => {
    await importData(page, `Date\tCount\n${date}\t0`)
    await expect(page.locator('[data-cell-index]')).toHaveCount(1)
    await expect(dateCell(page, date)).toHaveAttribute('data-weekday', weekday)
    await expect(dateCell(page, date)).toHaveAttribute('data-level', '0')
    await dateCell(page, date).click()
    await expect(page.getByRole('region', { name: '選択した日付の詳細' })).toContainText(
      date.replaceAll('-', '/'),
    )
  })
}

test('画面幅切替後も1日1セルを維持し、選択した日の詳細が残る', async ({ page }) => {
  await importData(page, 'Date\tCount\n2026-04-01\t6\n2026-04-11\t45')
  await dateCell(page, '2026-04-11').click()
  await page.setViewportSize({ width: 320, height: 740 })
  await expect(page.getByTestId('mobile-heatmap')).toBeVisible()
  await expect(page.locator('[data-cell-index]')).toHaveCount(11)
  await expect(page.getByRole('region', { name: '選択した日付の詳細' })).toContainText('45件')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.getByTestId('desktop-heatmap')).toBeVisible()
  await expect(page.locator('[data-cell-index]')).toHaveCount(11)
})

for (const timezoneId of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId })

    test('DST前後もUTCの日付と曜日を維持する', async ({ page }) => {
      await importData(page, 'Date\tCount\n2024-03-09\t50\n2024-03-11\t100')
      await expect(page.locator('[data-cell-index]')).toHaveCount(3)
      await expect(dateCell(page, '2024-03-09')).toHaveAttribute('data-weekday', '6')
      await expect(dateCell(page, '2024-03-10')).toHaveAttribute('data-weekday', '0')
      await expect(dateCell(page, '2024-03-11')).toHaveAttribute('data-weekday', '1')
      await expect(dateCell(page, '2024-03-10')).toHaveAccessibleName(
        '2024/03/10（日）：0件、0件、レベル0',
      )
    })
  })
}

test('320px幅でも最大安全整数の件数を省略せず表示する', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await importData(page, 'Date\tCount\n2026-04-01\t9007199254740991')
  await page.locator('[data-cell-index="0"]').click()
  await expect(page.getByRole('region', { name: '選択した日付の詳細' })).toContainText(
    '9,007,199,254,740,991件',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

for (const { width, layout } of [
  { width: 839, layout: 'mobile-heatmap' },
  { width: 840, layout: 'mobile-heatmap' },
  { width: 900, layout: 'mobile-heatmap' },
  { width: 959, layout: 'mobile-heatmap' },
  { width: 960, layout: 'desktop-heatmap' },
]) {
  const otherWidth = layout === 'mobile-heatmap' ? 960 : 959
  const otherLayout = layout === 'mobile-heatmap' ? 'desktop-heatmap' : 'mobile-heatmap'

  test(`幅${width}pxで表示方式と日付セルを維持する`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await importData(page, 'Date\tCount\n2023-12-30\t49\n2024-01-02\t0\n2024-01-03\t1000')
    const expectedDates = ['2023-12-30', '2023-12-31', '2024-01-01', '2024-01-02', '2024-01-03']
    await expectCalendarDates(page, layout, expectedDates)
    await dateCell(page, '2024-01-03').click()
    const detail = page.getByRole('region', { name: '選択した日付の詳細' })
    await expect(detail).toContainText('2024/01/03（水）')

    await page.setViewportSize({ width: otherWidth, height: 800 })
    await expectCalendarDates(page, otherLayout, expectedDates)
    await expect(detail).toContainText('2024/01/03（水）')

    await page.setViewportSize({ width, height: 800 })
    await expectCalendarDates(page, layout, expectedDates)
    await expect(detail).toContainText('2024/01/03（水）')
  })
}

async function expectCalendarDates(page: Page, layout: string, dates: string[]) {
  await expect(page.getByTestId(layout)).toBeVisible()
  await expect(page.locator('[data-testid$="-heatmap"]')).toHaveCount(1)
  const cells = page.locator('[data-cell-index]')
  await expect(cells).toHaveCount(dates.length)
  expect(
    await cells.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('data-date')).sort(),
    ),
  ).toEqual(dates)
}
