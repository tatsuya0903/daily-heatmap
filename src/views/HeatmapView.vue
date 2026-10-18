<script setup lang="ts">
import { computed } from 'vue'
import { mdiCalendarBlankOutline } from '@mdi/js'
import { seriesEndDate } from '@/domain/dates'
import { createHeatmapCells } from '@/domain/heatmap'
import { classifyWithProvisionalPreset, PROVISIONAL_LEGEND } from '@/domain/provisionalPreset'
import HeatmapCalendar from '@/components/heatmap/HeatmapCalendar.vue'
import { useImportedSeriesStore } from '@/stores/importedSeries'

const store = useImportedSeriesStore()
const endDate = computed(() =>
  store.source ? seriesEndDate(store.source.startDate, store.source.counts.length) : '',
)
const cells = computed(() =>
  store.source
    ? createHeatmapCells(store.source.startDate, classifyWithProvisionalPreset(store.source))
    : [],
)
</script>

<template>
  <section aria-labelledby="heatmap-title">
    <p class="eyebrow">あなたの記録</p>
    <h1 id="heatmap-title" class="page-title">ヒートマップ</h1>
    <v-card v-if="store.source" class="heatmap-card pa-4 pa-sm-6 mt-6" border>
      <h2 class="text-h6 mb-3">TSVの読み込みが完了しました</h2>
      <p role="status">
        {{ store.source.startDate }} 〜 {{ endDate }}（{{
          store.source.counts.length.toLocaleString('ja-JP')
        }}日分）
      </p>
      <p class="text-body-1 text-medium-emphasis my-4">
        日付順に整理し、未記録日は0件で補完しました。
      </p>
      <p class="text-body-2 text-medium-emphasis my-4">
        暫定表示：固定プリセット「中規模カウント」を使用しています。初期設定の分位点方式と閾値設定は今後対応します。
      </p>
      <HeatmapCalendar :cells="cells" :legend="PROVISIONAL_LEGEND" />
      <v-btn :to="{ name: 'home' }" color="primary" class="mt-6">別のTSVを読み込む</v-btn>
    </v-card>
    <v-card v-else class="pa-6 pa-sm-10 mt-6" border>
      <v-icon :icon="mdiCalendarBlankOutline" size="40" color="secondary" class="mb-4" />
      <h2 class="text-h6 mb-3">表示するデータがありません</h2>
      <p class="text-body-1 text-medium-emphasis mb-6">
        トップページからTSVファイルを読み込んでください。ページを再読み込みすると、読み込み中のデータは失われます。
      </p>
      <v-btn :to="{ name: 'home' }" color="primary">トップページへ戻る</v-btn>
    </v-card>
  </section>
</template>

<style scoped>
/* VCardの既定のoverflow:hiddenは、文書スクロールに対するstickyを妨げる。 */
.heatmap-card {
  overflow: visible;
}
</style>
