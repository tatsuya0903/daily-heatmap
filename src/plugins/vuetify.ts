import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { VHeatmap } from 'vuetify/labs/VHeatmap'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { ja } from 'vuetify/locale'

export function createAppVuetify() {
  return createVuetify({
    components: { VHeatmap },
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    locale: { locale: 'ja', fallback: 'ja', messages: { ja } },
    theme: {
      defaultTheme: 'dailyLight',
      themes: {
        dailyLight: {
          dark: false,
          variables: { 'medium-emphasis-opacity': 0.75 },
          colors: {
            primary: '#256b43',
            secondary: '#52645a',
            info: '#005a9c',
            warning: '#754400',
            background: '#f7f9f6',
            surface: '#ffffff',
            'on-background': '#1c2e23',
            'on-surface': '#1c2e23',
          },
        },
      },
    },
    defaults: {
      VBtn: { rounded: 'lg', elevation: 0 },
      VCard: { rounded: 'xl', elevation: 0 },
    },
  })
}
