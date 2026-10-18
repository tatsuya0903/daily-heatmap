<script setup lang="ts">
import { mdiCalendarBlankOutline } from '@mdi/js'
</script>

<template>
  <v-app>
    <a class="skip-link" href="#main-content">本文へ移動</a>
    <v-app-bar flat border="b" color="surface" height="72">
      <div class="app-header">
        <RouterLink class="brand" :to="{ name: 'home' }" aria-label="Daily Heatmap トップ">
          <v-icon :icon="mdiCalendarBlankOutline" color="primary" size="28" />
          <span>Daily Heatmap</span>
        </RouterLink>
        <span class="header-note">日々の記録を、ひと目で。</span>
      </div>
    </v-app-bar>
    <v-main tag="div">
      <main id="main-content" class="page-content" tabindex="-1">
        <RouterView />
      </main>
      <footer class="app-footer">あなたの記録は、あなたのブラウザーで。</footer>
    </v-main>
  </v-app>
</template>
