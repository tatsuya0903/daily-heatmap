<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { selectShareEncoding, type ShareMode } from '@/codec'
import type { HeatmapDocument } from '@/domain/series'
import { blockShareScroll } from '@/sharing/blockShareScroll'
import { createShareUrl, LONG_SHARE_URL_CHARS, shareErrorMessage } from '@/sharing/shareUrl'

const props = defineProps<{ document: HeatmapDocument }>()
const open = defineModel<boolean>({ required: true })
const router = useRouter()
const mode = ref<ShareMode>('compact')
const copying = ref(false)
const copied = ref(false)
const copyFailed = ref(false)
const urlText = useTemplateRef<HTMLTextAreaElement>('urlText')
const result = computed(() => {
  try {
    const encoding = selectShareEncoding(props.document, mode.value)
    return { url: createShareUrl(router, encoding.d, window.location.href), error: '' }
  } catch (cause) {
    return { url: '', error: shareErrorMessage(cause) }
  }
})

async function copyUrl() {
  if (!result.value.url || copying.value) return
  const url = result.value.url
  copying.value = true
  copied.value = false
  copyFailed.value = false
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(url)
    if (open.value && result.value.url === url) copied.value = true
  } catch {
    if (open.value && result.value.url === url) {
      copyFailed.value = true
      await nextTick()
      urlText.value?.focus()
      urlText.value?.select()
    }
  } finally {
    copying.value = false
  }
}

function changeMode() {
  copied.value = false
  copyFailed.value = false
}
</script>

<template>
  <v-dialog
    :scroll-strategy="blockShareScroll"
    v-model="open"
    max-width="640"
    aria-labelledby="share-title"
    scrollable
  >
    <v-card class="share-card">
      <v-card-title id="share-title" tag="h2">ヒートマップを共有</v-card-title>
      <v-card-text>
        <v-radio-group
          v-model="mode"
          label="共有方式"
          hide-details
          @update:model-value="changeMode"
        >
          <v-radio label="8段階（短いURL・初期選択）" value="compact" />
          <v-radio
            label="完全データ（正確な件数）"
            value="exact"
            :disabled="document.source.kind === 'levels'"
            aria-describedby="share-exact-help"
          />
        </v-radio-group>
        <p v-if="mode === 'compact'" class="mb-3">
          日付・8段階のレベル・確定した閾値を保存します。正確な件数は復元できず、共有先では閾値を変更できません。
        </p>
        <p v-else class="mb-3">
          日付・正確な合計件数・確定した閾値を保存します。共有先でも閾値を変更できます。
        </p>
        <p id="share-exact-help" class="mb-3">
          <template v-if="document.source.kind === 'levels'">
            コンパクトURLには正確な件数がないため、完全データ共有は選択できません。保存済みレベルと閾値のまま再共有します。完全データで共有するには元TSVを読み込み直してください。
          </template>
          <template v-else>元TSVのファイル名・列名・列別内訳はURLに含めません。</template>
        </p>
        <v-alert type="info" role="note" variant="tonal" class="mb-4">
          URLは暗号化されません。URLを知っている人はデータを解析できます。秘密情報を含むデータの共有には使用しないでください。
        </v-alert>
        <v-alert v-if="result.error" type="error" role="alert">{{ result.error }}</v-alert>
        <template v-else>
          <label for="share-url" class="url-label">生成URLのプレビュー</label>
          <textarea
            id="share-url"
            ref="urlText"
            :value="result.url"
            readonly
            rows="4"
            spellcheck="false"
            aria-describedby="share-length share-copy-help"
          />
          <p id="share-length" class="my-2" role="status">
            URL全体：{{ result.url.length.toLocaleString('ja-JP') }}文字
          </p>
          <v-alert
            v-if="result.url.length > LONG_SHARE_URL_CHARS"
            type="warning"
            variant="tonal"
            class="my-3"
          >
            URL全体が{{
              LONG_SHARE_URL_CHARS.toLocaleString('ja-JP')
            }}文字を超えています。共有アプリ側の扱いを確認してください。このままコピーできます。
          </v-alert>
          <p id="share-copy-help" :role="copyFailed ? 'alert' : undefined" class="my-3">
            {{
              copyFailed
                ? 'コピーできませんでした。上のURLを選択して、手動でコピーしてください。'
                : 'URLをコピーして共有できます。'
            }}
          </p>
        </template>
      </v-card-text>
      <v-card-actions class="share-actions">
        <v-btn variant="text" @click="open = false">閉じる</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!result.url"
          :loading="copying"
          @click="copyUrl"
        >
          URLをコピー
        </v-btn>
      </v-card-actions>
    </v-card>
    <v-snackbar v-model="copied" :timeout="3000" role="status">URLをコピーしました</v-snackbar>
  </v-dialog>
</template>

<style scoped>
.share-card {
  min-width: 0;
  overflow-wrap: anywhere;
}
.share-card :deep(.v-label) {
  white-space: normal;
}
.share-card :deep(.v-card-title) {
  white-space: normal;
}
.url-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}
textarea {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 10px;
  border: 1px solid #788b7e;
  border-radius: 6px;
  resize: vertical;
  overflow-wrap: anywhere;
  font-size: 14px;
  background: #fff;
  color: #1c2e23;
}
textarea:focus-visible {
  outline: 3px solid #256b43;
  outline-offset: 2px;
}
.share-actions {
  flex-wrap: wrap;
}
</style>
