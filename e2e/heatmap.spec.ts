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

async function activateDate(locator: Locator, touch: boolean) {
  if (touch) await locator.tap()
  else await locator.click()
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
  expect(focusStyle.stroke).toBe('3px')
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

for (const width of [320, 375, 390, 768]) {
  test(`幅${width}pxで正方形・7列・連続週・月境界と領域内スクロールを維持する`, async ({
    page,
    isMobile,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 })
    await importData(page, 'Date\tCount\n2026-04-01\t0\n2026-06-07\t1000')
    const calendar = page.getByTestId('mobile-heatmap')
    await expect(calendar).toBeVisible()
    const headers = calendar.locator('.v-heatmap__column-header')
    await expect(headers).toHaveText(['日', '月', '火', '水', '木', '金', '土'])
    await expect(calendar.locator('.v-heatmap__row-header')).toHaveCount(11)
    await expect(calendar.locator('[data-cell-index]')).toHaveCount(68)
    const geometry = await calendar.locator('[data-cell-index]').evaluateAll((elements) =>
      elements.map((el) => {
        const shape = el.querySelector<SVGRectElement>('.v-heatmap__cell-rect')!
        const rect = shape.getBoundingClientRect()
        const scale = shape.getScreenCTM()!
        return {
          width: rect.width,
          height: rect.height,
          cellWidth: shape.width.baseVal.value * scale.a,
          cellHeight: shape.height.baseVal.value * scale.d,
          x: rect.x,
          y: rect.y,
          date: el.getAttribute('data-date')!,
          weekday: Number(el.getAttribute('data-weekday')),
          week: Number(el.getAttribute('data-week')),
        }
      }),
    )
    const origin = geometry.find((cell) => cell.weekday === 0)!
    for (const cell of geometry) {
      // FirefoxのgetBoundingClientRectはstrokeも含むため、幾何サイズと描画枠を別々に検証する。
      expect(cell.cellWidth).toBe(44)
      expect(cell.cellHeight).toBe(44)
      expect(cell.width).toBe(cell.height)
      expect(cell.width).toBeGreaterThanOrEqual(44)
      expect(cell.x - origin.x).toBeCloseTo(cell.weekday * 47)
      expect(cell.y - origin.y).toBeCloseTo((cell.week - origin.week) * 47)
    }
    const april30 = geometry.find((cell) => cell.date === '2026-04-30')!
    const may1 = geometry.find((cell) => cell.date === '2026-05-01')!
    expect(april30.y).toBe(may1.y)
    expect(may1.x - april30.x).toBe(47)
    const last = dateCell(page, '2026-06-07')
    await activateDate(last, isMobile)
    await expect(page.getByRole('region', { name: '選択した日付の詳細' })).toContainText(
      '2026/06/07',
    )
    // SVGにも1つのTab停止点があり、横スクロール先までキー操作で追従する。
    await last.focus()
    await page.keyboard.press('Home')
    await expect(dateCell(page, '2026-04-01')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(dateCell(page, '2026-04-08')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(dateCell(page, '2026-04-01')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    await expect(dateCell(page, '2026-04-01')).toBeFocused()
    await page.keyboard.press('End')
    await expect(last).toBeFocused()
    await expect(calendar.locator('[data-cell-index][tabindex="0"]')).toHaveCount(1)
    const scroll = calendar.getByRole('region', { name: '週と曜日のヒートマップ' })
    const dimensions = await scroll.evaluate((el) => ({
      client: el.clientWidth,
      content: el.scrollWidth,
    }))
    expect(dimensions.content > dimensions.client).toBe(width < 768)
    await scroll.evaluate((el) => {
      el.scrollLeft = el.scrollWidth
    })
    expect(await scroll.evaluate((el) => el.scrollLeft > 0)).toBe(width < 768)
    const saturdayHeader = await headers.last().boundingBox()
    const scrollBox = await scroll.boundingBox()
    expect(saturdayHeader!.x).toBeGreaterThanOrEqual(scrollBox!.x)
    expect(saturdayHeader!.x + saturdayHeader!.width).toBeLessThanOrEqual(
      scrollBox!.x + scrollBox!.width,
    )
    await dateCell(page, '2026-06-06').focus()
    await expect(dateCell(page, '2026-06-06')).toBeInViewport()
    await activateDate(dateCell(page, '2026-06-06'), isMobile)
    await expect(page.getByRole('region', { name: '選択した日付の詳細' })).toContainText(
      '2026/06/06',
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`continuous-${width}.png`), fullPage: true })
  })
}
