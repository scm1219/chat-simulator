<template>
  <span class="emotion-tag" :class="emotionClass" :title="`${emotion} ${intensity}`">
    {{ emotion }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  emotion: { type: String, default: '平静' },
  intensity: { type: Number, default: 0 }
})

const emotionClass = computed(() => {
  const map = {
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
  return map[props.emotion] || 'emotion-neutral'
})
</script>

<style lang="scss" scoped>
.emotion-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
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
