<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { mdiFileTableOutline, mdiShieldCheckOutline } from '@mdi/js'
import { InputError } from '@/domain/inputError'
import { MAX_FILE_BYTES, MAX_SERIES_DAYS } from '@/domain/limits'
import { aggregateTsv, type ParsedTsv } from '@/domain/tsv'
import { readTsvFile } from '@/domain/tsvFile'
import { useImportedSeriesStore } from '@/stores/importedSeries'

const router = useRouter()
const store = useImportedSeriesStore()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const parsed = shallowRef<ParsedTsv | null>(null)
const selectedColumns = ref<number[]>([])
const fileName = ref('')
const error = ref('')
const loading = ref(false)
const dragging = ref(false)
const countColumns = computed(() => parsed.value?.headers.slice(1) ?? [])
let requestId = 0
onBeforeUnmount(() => {
  requestId++
})

function showError(cause: unknown) {
  error.value =
    cause instanceof InputError ? cause.message : '読み込みに失敗しました。もう一度お試しください。'
}

async function loadFiles(files: FileList | null) {
  const currentRequest = ++requestId
  parsed.value = null
  selectedColumns.value = []
  fileName.value = ''
  error.value = ''
  loading.value = false
  if (!files?.length) return
  if (files.length !== 1) {
    error.value = 'ファイルは1つずつ選択してください。'
    return
  }
  const file = files[0]!
  loading.value = true
  try {
    const result = await readTsvFile(file)
    if (currentRequest !== requestId) return
    parsed.value = result
    selectedColumns.value = result.headers.slice(1).map((_, index) => index + 1)
    fileName.value = file.name
  } catch (cause) {
    if (currentRequest === requestId) showError(cause)
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement
  void loadFiles(input.files)
  input.value = ''
}

function dropFile(event: DragEvent) {
  dragging.value = false
  void loadFiles(event.dataTransfer?.files ?? null)
}

async function importSelected() {
  if (!parsed.value || loading.value) return
  error.value = ''
  try {
    const result = aggregateTsv(parsed.value, selectedColumns.value)
    store.replaceSource(result)
    await router.push({ name: 'heatmap' })
  } catch (cause) {
    showError(cause)
  }
}
</script>

<template>
  <section aria-labelledby="home-title">
    <div class="intro">
      <p class="eyebrow">毎日の記録を、見えるかたちに</p>
      <h1 id="home-title">日々の積み重ねを、<br />一枚に。</h1>
      <p class="intro-description">
        日別の件数を、カレンダーのヒートマップへ。<br class="desktop-break" />
        記録のリズムを振り返り、URLで手軽に共有できます。
      </p>
    </div>

    <v-card class="pa-6 pa-sm-10" border>
      <v-icon :icon="mdiFileTableOutline" size="36" color="primary" class="mb-4" />
      <h2 class="text-h6 mb-3">TSVファイルからはじめる</h2>
      <p id="file-help" class="text-body-1 text-medium-emphasis mb-4">
        UTF-8の.tsv／.txt（{{ MAX_FILE_BYTES / 1024 / 1024 }}MiB以内）、対象期間は
        {{
          MAX_SERIES_DAYS.toLocaleString('ja-JP')
        }}日以内。先頭列はDate、続く列に件数を入れてください。
      </p>
      <div
        class="file-drop mb-4"
        :class="{ 'file-drop-active': dragging }"
        role="region"
        aria-label="TSVファイルのドロップ領域"
        :aria-busy="loading"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="dropFile"
      >
        <p class="mb-3">ここにファイルをドラッグ＆ドロップ</p>
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept=".tsv,.txt"
          aria-label="TSVファイル"
          aria-describedby="file-help"
          @change="chooseFile"
        />
        <v-btn color="primary" size="large" @click="fileInput?.click()">ファイルを選択</v-btn>
      </div>
      <p v-if="loading" role="status">ファイルを確認しています…</p>
      <v-alert v-if="error" type="error" role="alert" class="my-4">{{ error }}</v-alert>
      <form v-if="parsed" @submit.prevent="importSelected">
        <p class="mb-4 file-name">{{ fileName }}（{{ parsed.rows.length }}行）</p>
        <fieldset class="column-selection">
          <legend>合算する件数列を選択</legend>
          <p class="text-body-2 my-2">
            1列以上を選んでください。未選択の列は数値として評価しません。
          </p>
          <v-checkbox
            v-for="(name, index) in countColumns"
            :key="index"
            v-model="selectedColumns"
            :label="name"
            :value="index + 1"
            hide-details
            color="primary"
          />
        </fieldset>
        <v-btn type="submit" color="primary" class="mt-4" :disabled="selectedColumns.length === 0">
          選択した列を読み込む
        </v-btn>
      </form>
      <details class="mt-6">
        <summary>TSVの形式と架空のサンプル</summary>
        <p class="my-3">列はタブで区切ります。日付はYYYY-MM-DD、件数は0以上の安全な整数です。</p>
        <pre class="sample-tsv">
Date&#9;Count
2026-04-01&#9;6
2026-04-02&#9;4
2026-04-11&#9;45</pre>
      </details>
    </v-card>

    <div class="privacy-note">
      <v-icon :icon="mdiShieldCheckOutline" color="primary" size="22" />
      <p>ファイルはブラウザー内で処理します。元のファイルをサーバーに送信しません。</p>
    </div>
  </section>
</template>
