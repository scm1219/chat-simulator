<template>
  <div class="llm-config-panel">
    <div class="panel-header">
      <h3>LLM 配置管理</h3>
      <button class="btn btn-primary btn-sm" @click="manager?.openAdd()">
        + 添加配置
      </button>
    </div>

    <div class="panel-content">
      <ProfileManager ref="manager" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ProfileManager from './ProfileManager.vue'

const manager = ref(null)
</script>

<style lang="scss" scoped>
.llm-config-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: $spacing-lg;
  border-bottom: 1px solid $border-color;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
  }
}

.panel-content {
  flex: 1;
  overflow-y: auto;
}
</style>
