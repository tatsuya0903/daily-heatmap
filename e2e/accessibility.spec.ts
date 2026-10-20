import { expect, test, type Page } from '@playwright/test'
import { selectShareEncoding } from '../src/codec'

const method = (page: Page) => page.getByRole('combobox', { name: '閾値方式', exact: true })
const tabKey = (browser: string, backwards = false) =>
  `${browser === 'webkit' ? 'Alt+' : ''}${backwards ? 'Shift+' : ''}Tab`

async function load(page: Page) {
  const d = selectShareEncoding(
    {
      source: { kind: 'exact', startDate: '2026-04-01', counts: [0, 1, 2, 3, 5, 10, 20, 50] },
      thresholds: { method: 'preset', presetId: 0, boundaries: [2, 3, 5, 10, 20, 50] },
    },
    'exact',
  ).d
  await page.goto(`./#/heatmap?d=${d}`)
  await expect(page.locator('[data-date]')).toHaveCount(8)
}

test('キーボードでファイル・列・共有を操作し、閾値へフォーカス移動とTab両方向のトラップを確認する', async ({
  page,
  browserName,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'ファイルを選択' }).focus()
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  await (
    await chooser
  ).setFiles({
    name: 'synthetic.tsv',
    mimeType: 'text/tab-separated-values',
    buffer: Buffer.from('Date\tA\tB\n2026-04-01\t3\t3\n2026-04-02\t21\t24'),
  })
  const column = page.getByRole('checkbox', { name: 'B', exact: true })
  await column.focus()
  await page.keyboard.press('Space')
  await expect(column).not.toBeChecked()
  // macOS WebKitの既定設定ではOption+Tabでボタンを含める。
  await page.keyboard.press(tabKey(browserName))
  await expect(page.getByRole('button', { name: '選択した列を読み込む' })).toBeFocused()
  await page.keyboard.press('Enter')
  await method(page).focus()
  await expect(method(page)).toBeFocused()
  // macOS headlessのネイティブselect popupはキー注入で変更を再現できない。
  // popupの実機キー操作は手動項目に残し、ここでは公開APIで統合を確認する。
  await method(page).selectOption('preset')
  await expect(method(page)).toHaveValue('preset')
  const trigger = page.getByRole('button', { name: '共有する', exact: true })
  await trigger.focus()
  await page.keyboard.press('Space')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  const visited = new Set<string>()
  for (const key of [tabKey(browserName), tabKey(browserName, true)]) {
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press(key)
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
      const focus = await page.locator(':focus').evaluate((el) => ({
        tag: el.tagName,
        label: el.textContent?.trim(),
        outline: getComputedStyle(el.closest('.v-selection-control__input') ?? el).outlineWidth,
        overlay: el.querySelector('.v-btn__overlay')
          ? getComputedStyle(el.querySelector('.v-btn__overlay')!).opacity
          : '0',
      }))
      visited.add(focus.tag)
      // Native radio controls and Vuetify focus overlay supplement explicit CSS outlines.
      expect(focus.outline !== '0px' || Number(focus.overlay) > 0).toBe(true)
    }
  }
  expect([...visited]).toEqual(expect.arrayContaining(['INPUT', 'TEXTAREA', 'BUTTON']))
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('200%・400%拡大相当の幅で主要操作がリフローし、日付とラベルを保持する', async ({
  page,
}, testInfo) => {
  await load(page)
  for (const width of [640, 320]) {
    // 1280px desktop at 200/400% zoom has these CSS viewport widths.
    // This verifies reflow, not browser chrome zoom or assistive technology.
    await page.setViewportSize({ width, height: 740 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(method(page)).toHaveAccessibleName('閾値方式')
    const calendar = page.getByTestId('mobile-heatmap')
    await expect(calendar).toBeVisible()
    await expect(calendar.locator('[data-date]')).toHaveCount(8)
    const box = await calendar.locator('[data-date]').first().boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await method(page).selectOption('custom')
    for (let index = 1; index <= 6; index++)
      await expect(page.getByLabel(`境界値${index}`, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '共有する', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    )
    await page.screenshot({
      path: testInfo.outputPath(`reflow-${width}.png`),
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
})

test('reduced-motionとforced-colorsでも日付の説明・選択・フォーカスが使える', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' })
  await load(page)
  expect(
    await page.evaluate(() => ({
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forced: matchMedia('(forced-colors: active)').matches,
    })),
  ).toEqual({ reduced: true, forced: true })
  const cell = page.locator('[data-date="2026-04-08"]')
  await cell.focus()
  await expect(cell).toHaveAccessibleName('2026/04/08（水）：50件、50件以上、レベル7')
  await page.keyboard.press('Home')
  await expect(page.locator('[data-date="2026-04-01"]')).toBeFocused()
  await method(page).selectOption('linear')
  await expect(page.locator('[data-date]')).toHaveCount(8)
  const transitions = await page
    .locator('.v-heatmap__cell-rect')
    .evaluateAll((elements) => elements.map((el) => getComputedStyle(el).transitionDuration))
  expect(transitions.every((value) => value === '0s')).toBe(true)
  await page.locator('[data-date="2026-04-01"]').focus()
  const focus = await page.locator('[data-date="2026-04-01"]').evaluate((el) => {
    const style = getComputedStyle(el.querySelector('.v-heatmap__cell-rect') ?? el)
    return { outline: style.outlineWidth, stroke: style.strokeWidth }
  })
  expect(focus.outline === '3px' || focus.stroke === '3px').toBe(true)
  await page.screenshot({ path: testInfo.outputPath('forced-colors.png'), animations: 'disabled' })
})

test('実際の8色セルで日付テキストとフォーカス枠のコントラストを確認する', async ({
  page,
  isMobile,
}) => {
  await load(page)
  const ratios = []
  for (let i = 0; i < 8; i++) {
    const cell = page.locator(`[data-date="2026-04-0${i + 1}"]`)
    await cell.focus()
    ratios.push(
      await cell.evaluate((el, mobile) => {
        const rgb = (text: string) =>
          text
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
        const luminance = (color: number[]) =>
          color
            .map((value) => value / 255)
            .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
            .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index]!, 0)
        const contrast = (a: string, b: string) => {
          const values = [luminance(rgb(a)), luminance(rgb(b))].sort((a, b) => a - b)
          return (values[1]! + 0.05) / (values[0]! + 0.05)
        }
        const style = getComputedStyle(el)
        const rect = el.querySelector('.v-heatmap__cell-rect')
        const fill = rect ? getComputedStyle(rect).fill : style.backgroundColor
        return {
          text: mobile ? contrast(style.color, fill) : null,
          // Mobile outline sits outside the cell on the white card; SVG stroke sits inside.
          focus: contrast(
            rect ? getComputedStyle(rect).stroke : style.outlineColor,
            rect ? fill : 'rgb(255, 255, 255)',
          ),
        }
      }, isMobile),
    )
  }
  for (const ratio of ratios) {
    expect(ratio.focus).toBeGreaterThanOrEqual(3)
  }
  for (const textRatio of ratios
    .map((ratio) => ratio.text)
    .filter((value): value is number => value !== null)) {
    expect(textRatio).toBeGreaterThanOrEqual(4.5)
  }
})
