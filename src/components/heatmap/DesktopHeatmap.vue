<script setup lang="ts">
import { computed, toRef } from 'vue'
import { WEEKDAYS, groupHeatmapMonths, type HeatmapCell } from '@/domain/heatmap'
import { useHeatmapInteraction } from '@/composables/useHeatmapInteraction'

const props = defineProps<{ cells: HeatmapCell[] }>()
const emit = defineEmits<{ select: [cell: HeatmapCell] }>()
const { root, show, keydown } = useHeatmapInteraction(
  toRef(props, 'cells'),
  (cell) => emit('select', cell),
  'weeks',
)
const rows = [0, 1, 2, 3, 4, 5, 6]
const columns = computed(() =>
  Array.from({ length: (props.cells.at(-1)?.week ?? -1) + 1 }, (_, i) => i),
)
const months = computed(() => groupHeatmapMonths(props.cells))
const items = computed(() =>
  props.cells.map((cell) => ({ row: cell.weekday, column: cell.week, value: cell.level, cell })),
)
const thresholds = computed(() =>
  Array.from(
    new Map(
      props.cells.map((cell) => [cell.level, { min: cell.level, color: cell.color }]),
    ).values(),
  ).sort((a, b) => a.min - b.min),
)

// VHeatmap 4.2.1は各セルをSVG <g>で描画し、itemPropsをその要素へ渡す。
// 生の件数で再分類せず、VMのレベルと色を使用する。
function cellProps(item: { raw: { cell: HeatmapCell } }) {
  const cell = item.raw.cell
  return {
    role: 'button',
    tabindex: cell.index === 0 ? 0 : -1,
    'aria-label': cell.description,
    title: cell.description,
    'data-date': cell.date,
    'data-cell-index': cell.index,
    'data-weekday': cell.weekday,
    'data-week': cell.week,
    'data-level': cell.level,
  }
}
</script>

<template>
  <div
    ref="root"
    class="desktop-calendar"
    data-testid="desktop-heatmap"
    @mouseover="show"
    @focusin="show"
    @click="show"
    @keydown="keydown"
  >
    <div class="heatmap-scroll" role="region" aria-label="曜日と週のヒートマップ" tabindex="0">
      <div class="week-chart" :style="{ width: `${columns.length * 28 + 40}px` }">
        <div class="month-headings" aria-label="月の見出し">
          <span
            v-for="(month, index) in months"
            :key="month.key"
            :style="{
              left: `${month.firstWeek * 28}px`,
              top: index > 0 && month.firstWeek - months[index - 1]!.firstWeek < 4 ? '20px' : '0',
            }"
            >{{ month.label }}</span
          >
        </div>
        <v-heatmap
          :items="items"
          :rows="rows"
          :columns="columns"
          :thresholds="thresholds"
          :item-props="cellProps"
          :cell-size="24"
          :gap="4"
          :rounded="4"
          hide-column-headers
        >
          <template #row-header="{ row }">{{ WEEKDAYS[Number(row)] }}</template>
        </v-heatmap>
      </div>
    </div>
  </div>
</template>

<style scoped>
.heatmap-scroll {
  overflow-x: auto;
  padding: 6px;
}
.heatmap-scroll:focus-visible {
  outline: 3px solid #256b43;
  outline-offset: -3px;
}
.week-chart {
  min-width: 170px;
}
.month-headings {
  position: relative;
  height: 52px;
  margin-left: 40px;
  font-size: 12px;
}
.month-headings span {
  position: absolute;
  white-space: nowrap;
}
:deep(.v-heatmap) {
  padding: 0;
  --v-heatmap-row-header-padding: 16px;
}
:deep(.v-heatmap__body) {
  overflow: visible;
}
:deep(.v-heatmap__row-headers) {
  width: 40px;
}
:deep(.v-heatmap__cell) {
  cursor: pointer;
  scroll-margin-block: 280px 20px;
}
:deep(.v-heatmap__cell:focus) {
  outline: none;
}
:deep(.v-heatmap__cell:focus .v-heatmap__cell-rect) {
  stroke: #1c2e23;
  stroke-width: 3px;
}
:deep(.v-heatmap__cell[data-level='6']:focus .v-heatmap__cell-rect),
:deep(.v-heatmap__cell[data-level='7']:focus .v-heatmap__cell-rect) {
  stroke: #fff;
}
@media (forced-colors: active) {
  :deep(.v-heatmap__cell[data-level]:focus .v-heatmap__cell-rect) {
    stroke: Highlight;
  }
}
</style>
