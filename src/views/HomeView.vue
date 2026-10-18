<script setup lang="ts">
import { mdiFileTableOutline, mdiShieldCheckOutline } from '@mdi/js'
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
      <p class="text-body-1 text-medium-emphasis mb-4">
        日付と件数をまとめたTSVファイルを使います。ファイルの読み込み機能は準備中です。
      </p>
      <v-btn color="primary" size="large" disabled>ファイルを選択</v-btn>
    </v-card>

    <div class="privacy-note">
      <v-icon :icon="mdiShieldCheckOutline" color="primary" size="22" />
      <p>ファイルはブラウザー内で処理します。元のファイルをサーバーに送信しません。</p>
    </div>
  </section>
</template>
