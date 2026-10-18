import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.spec.ts'],
      setupFiles: ['./src/__tests__/setup.ts'],
      clearMocks: true,
      server: { deps: { inline: ['vuetify'] } },
    },
  }),
)
