<script setup lang="ts">
import { useTemplateRef } from 'vue'
import ThresholdSettings from '@/components/ThresholdSettings.vue'
import { useImportedSeriesStore } from '@/stores/importedSeries'

const store = useImportedSeriesStore()
const emit = defineEmits<{ share: [] }>()
const shareButton = useTemplateRef<{ $el: HTMLElement }>('shareButton')

defineExpose({
  focusShareButton: () => shareButton.value?.$el.focus({ preventScroll: true }),
})
</script>

<template>
  <div>
    <h2 v-if="store.restored" class="text-h6 mb-3">共有URLから復元しました</h2>
    <p class="text-body-1 text-medium-emphasis my-4">
      {{
        store.restored
          ? 'URLに保存された期間・確定した閾値で表示しています。'
          : '日付順に整理し、未記録日は0件で補完しました。'
      }}
    </p>
    <v-btn ref="shareButton" color="primary" aria-haspopup="dialog" @click="emit('share')"
      >共有する</v-btn
    >
    <p v-if="store.source?.kind === 'levels'" id="compact-help" class="my-4">
      コンパクトデータのため正確な件数は表示できず、閾値は変更できません。変更するには元TSVを読み込み直してください。
    </p>
    <ThresholdSettings
      :key="store.revision"
      :profile="store.thresholds"
      :disabled="store.source?.kind === 'levels'"
      @change="store.setThresholds"
    />
    <p v-if="store.restored" class="shared-help">
      日付に触れると詳細を確認できます。キーボードはTabで日付へ移動し、矢印キーで選択、Home／Endで期間の先頭／末尾へ移動できます。幅が足りない場合は、ヒートマップ内を左右にスクロールできます。
    </p>
  </div>
</template>

<style scoped>
.shared-help {
  color: #52645a;
  font-size: 13px;
  line-height: 1.8;
}
</style>
