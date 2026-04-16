<template>
  <div v-if="visible" class="staleness-tip">
    <span class="tip-icon">&#128161;</span>
    <span class="tip-text">对话似乎有些平淡，要不要来点转折？</span>
    <button class="tip-btn" @click="$emit('showEvents')">查看推荐事件</button>
    <button class="tip-dismiss" @click="$emit('dismiss')">忽略</button>
  </div>
</template>

<script setup>
defineProps({ visible: { type: Boolean, default: false } })
defineEmits(['showEvents', 'dismiss'])
</script>

<style lang="scss" scoped>
.staleness-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fff8e1;
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}
.tip-icon { font-size: 16px; }
.tip-text { flex: 1; color: #666; }
.tip-btn { background: #07c160; color: #fff; border: none; border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
.tip-dismiss { background: none; border: none; color: #999; font-size: 12px; cursor: pointer; text-decoration: underline; }
</style>
