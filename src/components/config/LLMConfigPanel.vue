<template>
  <div class="llm-config-panel">
    <div class="panel-header">
      <h3>LLM 配置管理</h3>
      <button class="btn btn-primary btn-sm" @click="manager?.openAdd()">
        + 添加配置
      </button>
    </div>

    <div class="panel-content">
      <!-- 决策模型：系统级配置，全局唯一生效，聊天中不可选/不可切换 -->
      <div class="decision-section">
        <div class="decision-header">
          <span class="decision-title">决策模型（系统级）</span>
          <select
            class="input decision-select"
            :value="configStore.llmConfig?.decisionProfileId || ''"
            :disabled="configStore.llmConfig === null || decisionProfiles.length === 0"
            @change="handleDecisionChange"
          >
            <option value="">未启用</option>
            <option v-for="profile in decisionProfiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}（{{ profile.model }}）
            </option>
          </select>
        </div>
        <small class="decision-hint">
          {{ decisionHint }}
        </small>
      </div>

      <ProfileManager ref="manager" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ProfileManager from './ProfileManager.vue'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useConfigStore } from '../../stores/config.js'
import { useToastStore } from '../../stores/toast'
import { isDecisionProfile } from '../../utils/llm-providers.js'

const manager = ref(null)
const llmProfilesStore = useLLMProfilesStore()
const configStore = useConfigStore()
const toast = useToastStore()

const decisionProfiles = computed(() =>
  llmProfilesStore.profiles
    .filter(isDecisionProfile)
    .sort((a, b) => a.name.localeCompare(b.name))
)

const decisionHint = computed(() => {
  if (decisionProfiles.value.length === 0) {
    return '用于系统内部高频判定（不生成文本、不影响对话生成）；先在下方添加百炼决策配置后可选择'
  }
  return '用于系统内部高频判定（不生成文本、不影响对话生成）'
})

onMounted(() => {
  llmProfilesStore.loadProfiles()
  configStore.loadLLMConfig()
})

async function handleDecisionChange(event) {
  const decisionProfileId = event.target.value
  const saved = await configStore.saveLLMConfig({
    ...configStore.llmConfig,
    decisionProfileId
  })
  if (!saved) {
    toast.error('保存决策模型选择失败')
  }
}
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

.decision-section {
  padding: $spacing-md $spacing-lg;
  border-bottom: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.decision-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: $spacing-md;
}

.decision-title {
  font-weight: $font-weight-medium;
  white-space: nowrap;
}

.decision-select {
  max-width: 260px;
}

.decision-hint {
  color: $text-secondary;
}
</style>
