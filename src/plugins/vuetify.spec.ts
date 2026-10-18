import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { VHeatmap } from 'vuetify/labs/VHeatmap'
import { createAppVuetify } from './vuetify'

describe('Vuetify 4 Labs連携', () => {
  it('VHeatmapで指定した軸と段階色を描画できる', () => {
    const wrapper = mount(VHeatmap, {
      props: {
        rows: [0],
        columns: [0, 1],
        items: [
          { row: 0, column: 0, value: 0 },
          { row: 0, column: 1, value: 7 },
        ],
        thresholds: [
          { min: 0, color: '#ebedf0' },
          { min: 7, color: '#10572e' },
        ],
      },
      global: { plugins: [createAppVuetify()] },
    })

    const cells = wrapper.findAll('.v-heatmap__cell')
    expect(cells).toHaveLength(2)
    expect(cells[0]?.attributes('style')).toContain('#ebedf0')
    expect(cells[1]?.attributes('style')).toContain('#10572e')
  })
})
