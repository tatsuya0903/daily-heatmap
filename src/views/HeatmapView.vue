<script setup lang="ts">
import { mdiCalendarBlankOutline } from '@mdi/js'
</script>

<template>
  <section aria-labelledby="heatmap-title">
    <p class="eyebrow">あなたの記録</p>
    <h1 id="heatmap-title" class="page-title">ヒートマップ</h1>
    <v-card class="pa-6 pa-sm-10 mt-6" border>
      <v-icon :icon="mdiCalendarBlankOutline" size="40" color="secondary" class="mb-4" />
      <h2 class="text-h6 mb-3">表示するデータがありません</h2>
      <p class="text-body-1 text-medium-emphasis mb-6">
        トップページからTSVファイルを読み込んでください。ページを再読み込みすると、読み込み中のデータは失われます。
      </p>
      <v-btn :to="{ name: 'home' }" color="primary">トップページへ戻る</v-btn>
    </v-card>
  </section>
</template>
