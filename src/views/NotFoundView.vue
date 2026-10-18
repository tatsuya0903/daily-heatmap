<template>
  <section aria-labelledby="not-found-title">
    <p class="eyebrow">ページが見つかりません</p>
    <h1 id="not-found-title" class="page-title">ページを開けませんでした</h1>
    <p class="my-6">URLを確認するか、トップページからやり直してください。</p>
    <v-btn :to="{ name: 'home' }" color="primary">トップページへ戻る</v-btn>
  </section>
</template>
