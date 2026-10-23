import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createAppVuetify } from '@/plugins/vuetify'
import { createHeatmapCells } from '@/domain/heatmap'
import { classifyDocument, createLegend, resolveThresholds } from '@/domain/thresholds'
import type { ExactSeries } from '@/domain/series'
import DesktopHeatmap from './DesktopHeatmap.vue'
import MobileHeatmap from './MobileHeatmap.vue'
import HeatmapCalendar from './HeatmapCalendar.vue'

const preset = resolveThresholds({ method: 'preset', presetId: 1 }, [])
const presetLegend = createLegend(preset.boundaries)
function classifyWithPreset(source: ExactSeries) {
  return classifyDocument({ source, thresholds: preset })
}

const cells = createHeatmapCells(
  '2023-12-31',
  classifyWithPreset({ kind: 'exact', startDate: '2023-12-31', counts: [0, 50, 1000] }),
)
const global = { plugins: [createAppVuetify()] }

describe('ヒートマップ表示と操作', () => {
  it('VHeatmapの実SVGへ日付ラベル・ロール・フォーカス属性を渡し、余白をセルにしない', async () => {
    const wrapper = mount(DesktopHeatmap, { props: { cells }, global })
    const buttons = wrapper.findAll('[role="button"]')
    expect(buttons).toHaveLength(3)
    expect(buttons[0]?.element.tagName.toLowerCase()).toBe('g')
    expect(buttons[0]?.attributes('tabindex')).toBe('0')
    expect(buttons[1]?.attributes('tabindex')).toBe('-1')
    expect(buttons[1]?.attributes('aria-label')).toBe('2024/01/01（月）：50件、50〜99件、レベル2')
    expect(buttons[1]?.get('title').text()).toBe(buttons[1]?.attributes('aria-label'))
    expect(buttons[0]?.attributes('transform')).toBe('translate(0,0)')
    expect(buttons[1]?.attributes('transform')).toBe('translate(0,28)')
    expect(wrapper.text()).toContain('2023年12月')
    expect(wrapper.text()).toContain('2024年1月')
    await buttons[1]!.trigger('mouseover')
    expect(wrapper.emitted('select')?.at(-1)).toEqual([cells[1]])
    await buttons[2]!.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('select')?.at(-1)).toEqual([cells[2]])
  })

  it('連続した7列の実SVGで、タップとフォーカスから同じVMを通知する', async () => {
    const wrapper = mount(MobileHeatmap, { props: { cells }, global })
    const buttons = wrapper.findAll('[role="button"]')
    expect(buttons).toHaveLength(3)
    expect(buttons[0]?.element.tagName.toLowerCase()).toBe('g')
    expect(wrapper.findAll('.month-labels > span').map((el) => el.text())).toEqual([
      '2023年12月',
      '2024年1月',
    ])
    expect(buttons[0]?.attributes('transform')).toBe('translate(0,0)')
    expect(buttons[1]?.attributes('transform')).toBe('translate(47,0)')
    await buttons[1]!.trigger('click')
    expect(wrapper.emitted('select')?.at(-1)).toEqual([cells[1]])
    await buttons[0]!.trigger('mouseover')
    expect(wrapper.emitted('select')?.at(-1)).toEqual([cells[1]])
    await buttons[2]!.trigger('focusin')
    expect(wrapper.emitted('select')?.at(-1)).toEqual([cells[2]])
    for (const key of ['Enter', ' ']) {
      await buttons[2]!.trigger('keydown', { key })
      expect(wrapper.emitted('select')?.at(-1)).toEqual([cells[2]])
    }
    expect(buttons[2]?.attributes('tabindex')).toBe('0')
    expect(wrapper.findAll('[data-cell-index][tabindex="0"]')).toHaveLength(1)
  })

  it('選択後も正確な件数・範囲・レベルの詳細と8色の凡例を表示する', async () => {
    const wrapper = mount(HeatmapCalendar, { props: { cells, legend: presetLegend }, global })
    const detail = wrapper.get('[aria-live="polite"]')
    expect(detail.text()).toContain('0件')
    await wrapper.get('[data-date="2024-01-02"]').trigger('click')
    expect(detail.text()).toContain('2024/01/02（火）')
    expect(detail.text()).toContain('1,000件')
    expect(detail.text()).toContain('レベル7 ・ 1,000件以上')
    expect(wrapper.findAll('li')).toHaveLength(8)
    await wrapper.setProps({ cells: cells.slice(0, 1) })
    expect(detail.text()).toContain('2023/12/31')
  })
  it('再分類時には選択日付を維持し、詳細のレベルと範囲だけ更新する', async () => {
    const wrapper = mount(HeatmapCalendar, { props: { cells, legend: presetLegend }, global })
    await wrapper.get('[data-date="2024-01-02"]').trigger('click')
    const source = { kind: 'exact' as const, startDate: '2023-12-31', counts: [0, 50, 1000] }
    const profile = resolveThresholds({ method: 'quantile' }, source.counts)
    await wrapper.setProps({
      cells: createHeatmapCells(
        source.startDate,
        classifyDocument({ source, thresholds: profile }),
      ),
      legend: createLegend(profile.boundaries),
    })
    expect(wrapper.get('[aria-live="polite"]').text()).toContain('2024/01/02')
    expect(wrapper.get('[aria-live="polite"]').text()).toContain('レベル2 ・ 1,000件以上')
  })
})
