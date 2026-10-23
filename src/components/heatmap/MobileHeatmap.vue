<script setup lang="ts">
import { computed, toRef } from 'vue'
import { WEEKDAYS, groupHeatmapMonths, type HeatmapCell } from '@/domain/heatmap'
import { useHeatmapInteraction } from '@/composables/useHeatmapInteraction'

const props = defineProps<{ cells: HeatmapCell[]; showHelp?: boolean }>()
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
  const labels = new Map<number, { key: string; year?: string; month: string }[]>()
  let previousYear: string | undefined
  for (const month of groupHeatmapMonths(props.cells)) {
    const row = month.firstWeek - firstWeek.value
    const year = month.key.slice(0, 4)
    const label = {
      key: month.key,
      year: year === previousYear ? undefined : `${year}年`,
      month: `${Number(month.key.slice(5, 7))}月`,
    }
    labels.set(row, [...(labels.get(row) ?? []), label])
    previousYear = year
  }
  return labels
})

// VHeatmap 4.2.1はitemPropsをSVG <g>へ渡す。分類済みの色を直接適用し、
// thresholdsによる再分類を避ける。日付は詳細欄とアクセシブルな説明で伝える。
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
    <p id="mobile-heatmap-scroll-help" v-show="showHelp !== false" class="scroll-help">
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
          <span
            v-if="monthLabels.has(Number(row))"
            class="month-labels"
            :class="{ 'month-labels--shared': monthLabels.get(Number(row))!.length > 1 }"
          >
            <span
              v-for="label in monthLabels.get(Number(row))"
              :key="label.key"
              class="month-label"
              :data-month="label.key"
            >
              <span v-if="label.year" class="month-year">{{ label.year }}</span>
              <span>{{ label.month }}</span>
            </span>
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
  gap: 4px;
  font-size: 12px;
  line-height: 16px;
}
.month-label {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.month-labels--shared {
  font-size: 11px;
  line-height: 15px;
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
:deep(.v-heatmap__row-header) {
  justify-content: flex-end;
}
:deep(.v-heatmap__cell) {
  cursor: pointer;
  scroll-margin-block: 280px 20px;
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
