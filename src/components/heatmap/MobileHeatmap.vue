<script setup lang="ts">
import { computed, toRef } from 'vue'
import { WEEKDAYS, groupHeatmapMonths, type HeatmapCell } from '@/domain/heatmap'
import { useHeatmapInteraction } from '@/composables/useHeatmapInteraction'

const props = defineProps<{ cells: HeatmapCell[] }>()
const emit = defineEmits<{ select: [cell: HeatmapCell] }>()
const { root, show, keydown } = useHeatmapInteraction(
  toRef(props, 'cells'),
  (cell) => emit('select', cell),
  'month',
)
const columns = [0, 1, 2, 3, 4, 5, 6]
const firstWeek = computed(() => props.cells[0]?.week ?? 0)
const rows = computed(() =>
  Array.from(
    { length: (props.cells.at(-1)?.week ?? firstWeek.value - 1) - firstWeek.value + 1 },
    (_, i) => i,
  ),
)
const items = computed(() =>
  props.cells.map((cell) => ({
    row: cell.week - firstWeek.value,
    column: cell.weekday,
    value: cell.level,
    cell,
  })),
)
const monthLabels = computed(() => {
  const labels = new Map<number, string[]>()
  for (const month of groupHeatmapMonths(props.cells)) {
    const row = month.firstWeek - firstWeek.value
    labels.set(row, [...(labels.get(row) ?? []), month.label])
  }
  return labels
})

// VHeatmap 4.2.1はitemPropsをSVG <g>へ渡す。分類済みの色を直接適用し、
// thresholdsによる再分類を避ける。cellスロットは日付数字だけを追加する。
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
    style: { '--v-heatmap-cell-color': cell.color },
  }
}
</script>

<template>
  <!-- タッチ後の疑似mouseoverやスクロールで、選択済みの日付を変更しない。 -->
  <div
    ref="root"
    class="mobile-calendar"
    data-testid="mobile-heatmap"
    @focusin="show"
    @click="show"
    @keydown="keydown"
  >
    <p id="mobile-heatmap-scroll-help" class="scroll-help">
      幅が足りない場合は、ヒートマップ内を左右にスクロールできます。
    </p>
    <div
      class="mobile-heatmap-scroll"
      role="region"
      aria-label="週と曜日のヒートマップ"
      aria-describedby="mobile-heatmap-scroll-help"
      tabindex="0"
    >
      <v-heatmap
        :items="items"
        :rows="rows"
        :columns="columns"
        :item-props="cellProps"
        :cell-size="44"
        :gap="3"
        :rounded="4"
      >
        <template #column-header="{ column }">{{ WEEKDAYS[Number(column)] }}</template>
        <template #row-header="{ row }">
          <span v-if="monthLabels.has(Number(row))" class="month-labels">
            <span v-for="label in monthLabels.get(Number(row))" :key="label">{{ label }}</span>
          </span>
        </template>
        <template #cell="{ item }">
          <span
            class="day-number"
            :style="{ color: item.raw.cell.level >= 6 ? '#fff' : '#1c2e23' }"
            aria-hidden="true"
          >
            {{ item.raw.cell.day }}
          </span>
        </template>
      </v-heatmap>
    </div>
  </div>
</template>

<style scoped>
.mobile-calendar {
  min-width: 0;
}
.scroll-help {
  color: #52645a;
  font-size: 12px;
  margin-bottom: 8px;
}
.mobile-heatmap-scroll {
  overflow-x: auto;
  padding: 6px;
}
.mobile-heatmap-scroll:focus-visible {
  outline: 3px solid #256b43;
  outline-offset: -3px;
}
.month-labels {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  line-height: 16px;
}
.day-number {
  font-size: 14px;
  font-weight: 600;
}
:deep(.v-heatmap) {
  padding: 0;
  --v-heatmap-row-header-padding: 12px;
}
:deep(.v-heatmap__body) {
  overflow: visible;
  padding: 0;
}
:deep(.v-heatmap__row-headers) {
  width: 88px;
}
:deep(.v-heatmap__cell) {
  cursor: pointer;
  scroll-margin-block: 280px 20px;
}
/* 数字やforeignObjectをタップしても、操作対象はSVGのCellに統一する。 */
:deep(.v-heatmap__cell-overlay) {
  pointer-events: none;
  user-select: none;
}
:deep(.v-heatmap__cell-rect) {
  stroke: #52645a40;
  stroke-width: 1px;
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
