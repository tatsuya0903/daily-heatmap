import type { Page } from '@playwright/test'

export async function showHeatmapDetails(page: Page) {
  await page.locator('[data-date]').first().waitFor()
  const toggle = page.getByRole('button', { name: '詳細情報を見る', exact: true })
  if (await toggle.isVisible()) await toggle.click()
}
