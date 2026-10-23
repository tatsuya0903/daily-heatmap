import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createAppVuetify } from '@/plugins/vuetify'
import { createHeatmapCells, WEEKDAYS } from '@/domain/heatmap'
import MobileHeatmap from './MobileHeatmap.vue'

const global = { plugins: [createAppVuetify()] }
function makeCells(start: string, count: number) {
  return createHeatmapCells(
    start,
    Array.from({ length: count }, (_, index) => ({
      level: index % 8,
      color: [
        '#ebedf0',
        '#daf2d0',
        '#b4e3a7',
        '#82cd81',
        '#52b762',
        '#2a924a',
        '#156c38',
        '#084526',
      ][index % 8]!,
      rangeLabel: index === 0 ? '0件' : '分類済み',
      exactCount: index,
    })),
  )
}

describe('スマホ版VHeatmapの連続配置', () => {
  it.each([
    ['2026-04-01', 75], // 4/30と5/1、日曜の月初、複数月
    ['2023-12-30', 12], // 年末と年始
    ['2024-02-28', 11], // 閏日と月末
    ['2025-02-28', 10], // 平年
    ['0001-01-01', 1],
    ['9999-12-31', 1],
  ])('%sから%d日を、月や年をまたいでも同じ週に配置する', (start, count) => {
    const cells = makeCells(start, count)
    const wrapper = mount(MobileHeatmap, { props: { cells }, global })
    expect(wrapper.findAll('.v-heatmap__column-header').map((el) => el.text())).toEqual([
      ...WEEKDAYS,
    ])
    expect(wrapper.findAll('[data-cell-index]')).toHaveLength(count)
    expect(wrapper.findAll('foreignObject, .day-number')).toHaveLength(0)
    expect(wrapper.findAll('.v-heatmap__row-header')).toHaveLength(cells.at(-1)!.week + 1)
    expect(wrapper.get('svg').attributes('width')).toBe('326')
    expect(wrapper.get('svg').attributes('height')).toBe(String((cells.at(-1)!.week + 1) * 47 - 3))
    for (const cell of cells) {
      const element = wrapper.get(`[data-date="${cell.date}"]`)
      expect(element.attributes('transform')).toBe(
        `translate(${cell.weekday * 47},${cell.week * 47})`,
      )
      expect(element.get('rect.v-heatmap__cell-rect').attributes('width')).toBe('44')
      expect(element.get('rect.v-heatmap__cell-rect').attributes('height')).toBe('44')
      expect(element.attributes('aria-label')).toBe(cell.description)
      expect(element.get('title').text()).toBe(cell.description)
      expect(element.attributes('data-level')).toBe(String(cell.level))
      expect(element.attributes('style')).toContain(`--v-heatmap-cell-color: ${cell.color}`)
    }
    const months = cells.filter((cell, index) => cell.monthKey !== cells[index - 1]?.monthKey)
    expect(wrapper.findAll('.month-label')).toHaveLength(months.length)
    for (const [index, cell] of months.entries()) {
      const label = wrapper.get(`[data-month="${cell.monthKey}"]`)
      const year = cell.monthKey.slice(0, 4)
      const month = `${Number(cell.monthKey.slice(5, 7))}月`
      const expected =
        year === months[index - 1]?.monthKey.slice(0, 4) ? [month] : [`${year}年`, month]
      expect(label.findAll('span').map((el) => el.text())).toEqual(expected)
      expect(
        wrapper.findAll('.v-heatmap__row-header')[cell.week]!.element.contains(label.element),
      ).toBe(true)
    }
  })

  it('開始週を0へ正規化し、存在しない日付を補完しない', () => {
    const cells = makeCells('2026-04-01', 40).slice(25)
    cells.splice(2, 1)
    const wrapper = mount(MobileHeatmap, { props: { cells }, global })
    expect(wrapper.findAll('[data-cell-index]')).toHaveLength(cells.length)
    expect(wrapper.find('[data-date="2026-04-28"]').exists()).toBe(false)
    expect(wrapper.get(`[data-date="${cells[0]!.date}"]`).attributes('transform')).toBe(
      'translate(0,0)',
    )
    expect(wrapper.findAll('.v-heatmap__row-header')).toHaveLength(
      cells.at(-1)!.week - cells[0]!.week + 1,
    )
  })

  it('空の期間に日付セルや余分な週を作らない', () => {
    const wrapper = mount(MobileHeatmap, { props: { cells: [] }, global })
    expect(wrapper.findAll('[data-cell-index]')).toHaveLength(0)
    expect(wrapper.findAll('.v-heatmap__row-header')).toHaveLength(0)
  })
})
