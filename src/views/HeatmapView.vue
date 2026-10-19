<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import ShareDialog from '@/components/ShareDialog.vue'
import { restoreShareQuery, shareErrorMessage } from '@/sharing/shareUrl'
import { mdiCalendarBlankOutline } from '@mdi/js'
import { seriesEndDate } from '@/domain/dates'
import { createHeatmapCells } from '@/domain/heatmap'
import ThresholdSettings from '@/components/ThresholdSettings.vue'
import HeatmapCalendar from '@/components/heatmap/HeatmapCalendar.vue'
import { useImportedSeriesStore } from '@/stores/importedSeries'

const store = useImportedSeriesStore()
const route = useRoute()
const error = ref('')
const sharing = ref(false)
const shareButton = useTemplateRef<{ $el: HTMLElement }>('shareButton')
watch(sharing, async (open) => {
  if (!open) {
    await nextTick()
    shareButton.value?.$el.focus({ preventScroll: true })
  }
})
watch(
  () => route.query.d,
  () => {
    sharing.value = false
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
      <h2 class="text-h6 mb-3">
        {{ store.restored ? '共有URLから復元しました' : 'TSVの読み込みが完了しました' }}
      </h2>
      <p role="status">
        {{ store.source.startDate }} 〜 {{ endDate }}（{{
          store.dayCount.toLocaleString('ja-JP')
        }}日分）
      </p>
      <p class="text-body-1 text-medium-emphasis my-4">
        {{
          store.restored
            ? 'URLに保存された期間・確定した閾値で表示しています。'
            : '日付順に整理し、未記録日は0件で補完しました。'
        }}
      </p>
      <v-btn ref="shareButton" color="primary" aria-haspopup="dialog" @click="sharing = true"
        >共有する</v-btn
      >
      <p v-if="store.source.kind === 'levels'" id="compact-help" class="my-4">
        コンパクトデータのため正確な件数は表示できず、閾値は変更できません。変更するには元TSVを読み込み直してください。
      </p>
      <ThresholdSettings
        :key="store.revision"
        :profile="store.thresholds"
        :disabled="store.source.kind === 'levels'"
        @change="store.setThresholds"
      />
      <ShareDialog v-if="sharing && store.document" v-model="sharing" :document="store.document" />
      <HeatmapCalendar :cells="cells" :legend="store.legend" />
      <v-btn :to="{ name: 'home' }" color="primary" class="mt-6">別のTSVを読み込む</v-btn>
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
</style>
