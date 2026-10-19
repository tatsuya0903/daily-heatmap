<script setup lang="ts">
import { computed, ref } from 'vue'
import { mdiChevronDown } from '@mdi/js'
import {
  PRESETS,
  parseCustomBoundaries,
  type PresetId,
  type ThresholdMethod,
  type ThresholdProfile,
  type ThresholdSelection,
} from '@/domain/thresholds'

const props = defineProps<{ profile: ThresholdProfile }>()
const emit = defineEmits<{ change: [selection: ThresholdSelection] }>()
const method = ref<ThresholdMethod>(props.profile.method)
const presetId = ref<PresetId>(props.profile.method === 'preset' ? props.profile.presetId : 0)
const customInputs = ref(
  (props.profile.method === 'custom' ? props.profile.boundaries : PRESETS[0].boundaries).map(
    String,
  ),
)
const error = ref('')
const boundaryLabel = computed(() =>
  props.profile.boundaries.length
    ? `${props.profile.boundaries.map((b) => b.toLocaleString('ja-JP')).join(' / ')} 件`
    : '境界値なし（正の件数はすべてレベル1）',
)
const methods: { value: ThresholdMethod; label: string; description: string }[] = [
  {
    value: 'quantile',
    label: '分位点（Quantile）',
    description: '正の件数を順位で区分します。同じ件数は同じレベルになります。',
  },
  {
    value: 'preset',
    label: '固定プリセット',
    description: '用途に合わせて固定の境界値を選びます。',
  },
  {
    value: 'linear',
    label: '均等幅（Linear）',
    description: '正の最小件数から最大件数までを均等な幅で区分します。',
  },
  {
    value: 'log',
    label: '対数（Logarithmic）',
    description: '件数の桁の違いを捉えやすい対数の幅で区分します。',
  },
  {
    value: 'custom',
    label: 'カスタム',
    description: 'レベル2〜7の開始値を6個、厳密な昇順で入力します。',
  },
]
function apply() {
  error.value = ''
  try {
    const selection: ThresholdSelection =
      method.value === 'custom'
        ? { method: 'custom', boundaries: parseCustomBoundaries(customInputs.value) }
        : method.value === 'preset'
          ? { method: 'preset', presetId: presetId.value }
          : { method: method.value }
    emit('change', selection)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '境界値を確認してください。'
  }
}
</script>

<template>
  <section class="threshold-settings" aria-labelledby="threshold-title">
    <h2 id="threshold-title" class="text-h6">閾値設定</h2>
    <div class="selection-fields">
      <label class="setting-field">
        <span>閾値方式</span>
        <span class="select-control">
          <select v-model="method" @change="apply">
            <option v-for="entry in methods" :key="entry.value" :value="entry.value">
              {{ entry.label }}
            </option>
          </select>
          <v-icon :icon="mdiChevronDown" aria-hidden="true" />
        </span>
      </label>
      <label v-if="method === 'preset'" class="setting-field">
        <span>固定プリセットID</span>
        <span class="select-control">
          <select v-model="presetId" @change="apply">
            <option v-for="preset in PRESETS" :key="preset.id" :value="preset.id">
              ID {{ preset.id }}：{{ preset.name }}
            </option>
          </select>
          <v-icon :icon="mdiChevronDown" aria-hidden="true" />
        </span>
      </label>
    </div>
    <p class="setting-description">
      {{ methods.find((entry) => entry.value === method)?.description }}
    </p>
    <fieldset
      v-if="method === 'custom'"
      :aria-describedby="error ? 'custom-help custom-error' : 'custom-help'"
    >
      <legend>カスタム境界値（件）</legend>
      <p id="custom-help" class="setting-description">
        2以上9,007,199,254,740,991以下の半角整数。小さい順に入力してください。
      </p>
      <div class="custom-fields">
        <label v-for="(_, index) in customInputs" :key="index" class="setting-field">
          <span>境界値{{ index + 1 }}</span>
          <input
            v-model="customInputs[index]"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            :aria-invalid="!!error"
            :aria-describedby="error ? 'custom-help custom-error' : 'custom-help'"
            @input="apply"
          />
        </label>
      </div>
    </fieldset>
    <p v-if="error" id="custom-error" role="alert" class="input-error">
      {{ error }} 直前の正常な設定で表示を維持しています。
    </p>
    <div class="confirmed-boundaries" aria-label="確定した境界値" aria-live="polite">
      <strong>確定した境界値</strong>
      <p>適用中：{{ methods.find((entry) => entry.value === profile.method)?.label }}</p>
      <p>{{ boundaryLabel }}</p>
    </div>
    <p class="setting-description">
      0件は常にレベル0です。境界値に一致する件数は次のレベルに入ります。使われないレベルがある場合も8色の凡例を表示します。
    </p>
  </section>
</template>

<style scoped>
.threshold-settings {
  margin-block: 24px;
}
.selection-fields,
.custom-fields {
  display: grid;
  gap: 16px;
  margin-block: 16px;
}
.selection-fields {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
}
.custom-fields {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.setting-field {
  display: grid;
  gap: 6px;
  min-width: 0;
  font-size: 14px;
}
select,
input {
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: 10px;
  background: #fff;
  color: #1c2e23;
  border: 1px solid #788b7e;
  border-radius: 6px;
  font: inherit;
}
/* Safariのネイティブ外観は指定高さでも小さく描くため、枠と矢印を共通化する。 */
select {
  appearance: none;
  padding-right: 40px;
}
.select-control {
  position: relative;
}
.select-control .v-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}
select:focus-visible,
input:focus-visible {
  outline: 3px solid #256b43;
  outline-offset: 2px;
}
input[aria-invalid='true'] {
  border-color: #a12622;
}
fieldset {
  min-width: 0;
  padding: 12px;
  border: 1px solid #c0cec4;
  border-radius: 8px;
}
.setting-description {
  color: #52645a;
  font-size: 14px;
  line-height: 1.8;
  margin-block: 12px;
}
.input-error {
  color: #a12622;
  margin-block: 16px;
}
.confirmed-boundaries {
  padding: 12px;
  margin-block: 16px;
  background: #f4f7f5;
  border-radius: 6px;
  overflow-wrap: anywhere;
}
@media (max-width: 599px) {
  .custom-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
