import { expect, test } from '@playwright/test'
import { selectShareEncoding } from '../src/codec'

for (const mode of ['exact', 'compact'] as const) {
  test(`${mode}共有URLはヒートマップを優先し、末尾のボタンで説明・設定・共有を開閉できる`, async ({
    page,
  }, testInfo) => {
    const d = selectShareEncoding(
      {
        source: { kind: 'exact', startDate: '2026-04-01', counts: [0, 1, 2, 3, 5, 10, 20, 50] },
        thresholds: { method: 'preset', presetId: 0, boundaries: [2, 3, 5, 10, 20, 50] },
      },
      mode,
    ).d
    await page.goto(`./#/heatmap?d=${d}`)
    const calendar = page.locator('.heatmap-calendar')
    const details = page.locator('.shared-details')
    const toggle = page.getByRole('button', { name: '詳細情報を見る', exact: true })
    await expect(page.locator('[data-date]')).toHaveCount(8)
    await expect(page.getByRole('status')).toContainText('2026-04-01 〜 2026-04-08')
    await expect(details).toBeHidden()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('button', { name: '共有する', exact: true })).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: '閾値方式', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '別のTSVを読み込む', exact: true })).toHaveCount(0)
    expect(
      await page
        .locator('.calendar-help, .scroll-help')
        .evaluateAll((elements) => elements.every((el) => getComputedStyle(el).display === 'none')),
    ).toBe(true)
    const calendarBox = await calendar.boundingBox()
    const toggleBox = await toggle.boundingBox()
    expect(toggleBox!.y).toBeGreaterThanOrEqual(calendarBox!.y + calendarBox!.height)
    expect(toggleBox!.x + toggleBox!.width / 2).toBeCloseTo(
      calendarBox!.x + calendarBox!.width / 2,
      0,
    )
    await page.locator('[data-date="2026-04-08"]').click()
    await expect(page.getByRole('region', { name: '選択した日付の詳細' })).toContainText(
      '2026/04/08',
    )
    await page.screenshot({
      path: testInfo.outputPath(`shared-${mode}-collapsed.png`),
      fullPage: true,
    })
    await toggle.click()
    await expect(details).toBeVisible()
    await expect(
      details.getByRole('link', { name: '別のTSVを読み込む', exact: true }),
    ).toBeVisible()
    const expandedToggle = page.getByRole('button', { name: '詳細情報を閉じる', exact: true })
    await expect(expandedToggle).toHaveAttribute('aria-expanded', 'true')
    const method = page.getByRole('combobox', { name: '閾値方式', exact: true })
    await expect(method).toBeVisible()
    await expect(method).toHaveValue('preset')
    await expect(method).toBeEnabled({ enabled: mode === 'exact' })
    await expect(page.getByRole('button', { name: '共有する', exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(`shared-${mode}-expanded.png`),
      fullPage: true,
    })
    await expandedToggle.focus()
    await page.keyboard.press('Space')
    await expect(details).toBeHidden()
    await expect(toggle).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(details).toBeVisible()
    await page.getByRole('button', { name: '共有する', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '共有する', exact: true })).toBeFocused()
    await page.reload()
    await expect(details).toBeHidden()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
}
