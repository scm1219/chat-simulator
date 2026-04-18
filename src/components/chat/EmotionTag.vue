<template>
  <span class="emotion-tag-wrapper">
    <span
      class="emotion-tag"
      :class="[emotionClass, { clickable: editable }]"
      :title="editable ? '点击调整情绪' : `${emotion} ${intensity}`"
      @click.stop="editable && (showPicker = !showPicker)"
    >
      {{ emotion }}
    </span>
    <div v-if="showPicker" class="emotion-picker" @click.stop>
      <div class="picker-emotions">
        <span
          v-for="opt in emotionOptions"
          :key="opt"
          class="picker-option"
          :class="[EMOTION_CSS_MAP[opt] || 'emotion-neutral', { active: emotion === opt }]"
          @click="selectEmotion(opt)"
        >{{ opt }}</span>
      </div>
      <div class="picker-intensity" v-if="tempEmotion">
        <label>强度: {{ tempIntensity.toFixed(1) }}</label>
        <input type="range" min="0.1" max="1.0" step="0.1" v-model.number="tempIntensity" />
      </div>
      <div class="picker-actions">
        <button class="btn-apply" @click="apply" :disabled="!tempEmotion">确定</button>
        <button class="btn-clear" @click="clear">清除</button>
        <button class="btn-cancel" @click="showPicker = false">取消</button>
      </div>
    </div>
  </span>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  emotion: { type: String, default: '平静' },
  intensity: { type: Number, default: 0 },
  characterId: { type: String, default: '' },
  editable: { type: Boolean, default: false }
})

const emit = defineEmits(['update'])

const showPicker = ref(false)
const tempEmotion = ref('')
const tempIntensity = ref(0.5)

// 情绪 → CSS 类名映射（统一数据源，消除重复）
const EMOTION_CSS_MAP = {
  '平静': 'emotion-neutral',
  '开心': 'emotion-happy',
  '愤怒': 'emotion-angry',
  '尴尬': 'emotion-awkward',
  '感动': 'emotion-moved',
  '悲伤': 'emotion-sad',
  '惊讶': 'emotion-surprised',
  '嫉妒': 'emotion-jealous',
  '疲惫': 'emotion-tired',
  '紧张': 'emotion-nervous',
  '惊慌': 'emotion-panic',
  '恐慌': 'emotion-terror',
  '好奇': 'emotion-curious',
  '无奈': 'emotion-helpless',
  '沮丧': 'emotion-depressed',
  '焦虑': 'emotion-anxious'
}

const emotionOptions = ref(['平静'])

const emotionClass = computed(() => EMOTION_CSS_MAP[props.emotion] || 'emotion-neutral')

onMounted(async () => {
  // 从后端获取情绪列表，保持与 constants.js 同步
  const result = await window.electronAPI.narrative.getEmotionList()
  if (result.success) {
    emotionOptions.value = ['平静', ...result.data]
  }
  document.addEventListener('click', handleClickOutside)
})

function selectEmotion(opt) {
  tempEmotion.value = opt
  if (opt === '平静') {
    tempIntensity.value = 0
  } else if (tempIntensity.value === 0) {
    tempIntensity.value = 0.5
  }
}

function apply() {
  if (!tempEmotion.value) return
  emit('update', {
    emotion: tempEmotion.value,
    intensity: tempEmotion.value === '平静' ? 0 : tempIntensity.value
  })
  showPicker.value = false
}

function clear() {
  emit('update', { emotion: '平静', intensity: 0 })
  showPicker.value = false
}

// 点击外部关闭
function handleClickOutside(e) {
  if (showPicker.value) showPicker.value = false
}
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<style lang="scss" scoped>
.emotion-tag-wrapper {
  position: relative;
  display: inline-flex;
}

.emotion-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
  &.clickable {
    cursor: pointer;
    transition: box-shadow 0.15s;
    &:hover { box-shadow: 0 0 0 1px rgba(0,0,0,0.15); }
  }
}

.emotion-picker {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  min-width: 200px;
  margin-top: 4px;
}

.picker-emotions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.picker-option {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: border-color 0.15s;
  &.active { border-color: #333; font-weight: 600; }
  &:hover { border-color: #999; }
}

.picker-intensity {
  margin-bottom: 8px;
  label { font-size: 11px; color: #666; display: block; margin-bottom: 2px; }
  input[type="range"] { width: 100%; height: 4px; accent-color: #07c160; }
}

.picker-actions {
  display: flex;
  gap: 6px;
  button {
    flex: 1;
    padding: 3px 0;
    border-radius: 4px;
    font-size: 11px;
    border: 1px solid #ddd;
    cursor: pointer;
    background: #fff;
    &:hover { background: #f5f5f5; }
  }
  .btn-apply { background: #07c160; color: #fff; border-color: #07c160; &:hover { background: #06ad56; } }
  .btn-apply:disabled { opacity: 0.5; cursor: default; }
}

.emotion-happy { background: #e8f5e9; color: #2e7d32; }
.emotion-angry { background: #ffebee; color: #c62828; }
.emotion-awkward { background: #fff8e1; color: #f9a825; }
.emotion-moved { background: #fce4ec; color: #ad1457; }
.emotion-sad { background: #e3f2fd; color: #1565c0; }
.emotion-surprised { background: #fff3e0; color: #e65100; }
.emotion-jealous { background: #f3e5f5; color: #6a1b9a; }
.emotion-tired { background: #eceff1; color: #546e7a; }
.emotion-nervous { background: #fff8e1; color: #ff6f00; }
.emotion-panic { background: #ffebee; color: #b71c1c; }
.emotion-terror { background: #ffebee; color: #b71c1c; }
.emotion-curious { background: #e8f5e9; color: #1b5e20; }
.emotion-helpless { background: #eceff1; color: #455a64; }
.emotion-depressed { background: #e3f2fd; color: #0d47a1; }
.emotion-anxious { background: #fff3e0; color: #e65100; }
.emotion-neutral { background: #f5f5f5; color: #757575; }
</style>
