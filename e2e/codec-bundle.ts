import { fileURLToPath } from 'node:url'
import { build } from 'vite'

export async function buildCodecBundle(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      target: 'es2022',
      lib: {
        entry: fileURLToPath(new URL('./codec-entry.ts', import.meta.url)),
        formats: ['iife'],
        name: 'CodecForTests',
      },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  for (const output of outputs) {
    if (!('output' in output)) continue
    for (const chunk of output.output) {
      if (chunk.type === 'chunk' && chunk.isEntry) return chunk.code
    }
  }
  throw new Error('Codec test bundle was not generated')
}
