<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import ShareDialog from '@/components/ShareDialog.vue'
import { restoreShareQuery, shareErrorMessage } from '@/sharing/shareUrl'
import { mdiCalendarBlankOutline } from '@mdi/js'
import { seriesEndDate } from '@/domain/dates'
import { createHeatmapCells } from '@/domain/heatmap'
import HeatmapCalendar from '@/components/heatmap/HeatmapCalendar.vue'
import HeatmapInformation from '@/components/heatmap/HeatmapInformation.vue'
import { useImportedSeriesStore } from '@/stores/importedSeries'

const store = useImportedSeriesStore()
const route = useRoute()
const error = ref('')
const sharing = ref(false)
const detailsOpen = ref(false)
const detailsId = useId()
const information = useTemplateRef<InstanceType<typeof HeatmapInformation>>('information')
watch(sharing, async (open) => {
  if (!open) {
    await nextTick()
    information.value?.focusShareButton()
  }
})
watch(
  () => route.query.d,
  () => {
    sharing.value = false
    detailsOpen.value = false
    error.value = ''
    try {
      const document = restoreShareQuery(route.query)
      if (document) store.replaceDocument(document)
      else if (store.restored) store.clear()
    } catch (cause) {
      store.clear()
      error.value = shareErrorMessage(cause)
    }
  },
  { immediate: true },
)
const endDate = computed(() =>
  store.source ? seriesEndDate(store.source.startDate, store.dayCount) : '',
)
const cells = computed(() =>
  store.source ? createHeatmapCells(store.source.startDate, store.classifiedDays) : [],
)
</script>

<template>
  <section aria-labelledby="heatmap-title">
    <p class="eyebrow">あなたの記録</p>
    <h1 id="heatmap-title" class="page-title">ヒートマップ</h1>
    <v-card v-if="store.source" class="heatmap-card pa-4 pa-sm-6 mt-6" border>
      <h2 v-if="!store.restored" class="text-h6 mb-3">TSVの読み込みが完了しました</h2>
      <p role="status">
        {{ store.source.startDate }} 〜 {{ endDate }}（{{
          store.dayCount.toLocaleString('ja-JP')
        }}日分）
      </p>
      <HeatmapInformation v-if="!store.restored" ref="information" @share="sharing = true" />
      <ShareDialog v-if="sharing && store.document" v-model="sharing" :document="store.document" />
      <HeatmapCalendar :cells="cells" :legend="store.legend" :show-help="!store.restored" />
      <template v-if="store.restored">
        <div class="shared-details-toggle">
          <v-btn
            variant="text"
            :height="44"
            :aria-controls="detailsId"
            :aria-expanded="detailsOpen"
            @click="detailsOpen = !detailsOpen"
          >
            {{ detailsOpen ? '詳細情報を閉じる' : '詳細情報を見る' }}
          </v-btn>
        </div>
        <section
          :id="detailsId"
          v-show="detailsOpen"
          class="shared-details"
          aria-label="ヒートマップの詳細情報"
        >
          <HeatmapInformation ref="information" @share="sharing = true" />
          <v-btn :to="{ name: 'home' }" color="primary" class="mt-6">別のTSVを読み込む</v-btn>
        </section>
      </template>
      <v-btn v-if="!store.restored" :to="{ name: 'home' }" color="primary" class="mt-6"
        >別のTSVを読み込む</v-btn
      >
    </v-card>
    <v-card v-else class="pa-6 pa-sm-10 mt-6" border>
      <v-icon :icon="mdiCalendarBlankOutline" size="40" color="secondary" class="mb-4" />
      <h2 class="text-h6 mb-3">
        {{ error ? '共有URLを読み込めませんでした' : '表示するデータがありません' }}
      </h2>
      <v-alert v-if="error" type="error" role="alert" class="mb-4">{{ error }}</v-alert>
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
.shared-details {
  margin-top: 12px;
  padding-top: 16px;
  border-top: 1px solid #c0cec4;
}
.shared-details-toggle {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}
</style>
