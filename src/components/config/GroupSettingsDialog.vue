<template>
  <div class="dialog-overlay" @click.self="$emit('close')">
    <div class="dialog">
      <div class="dialog-header">
        <h3>群设置</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="dialog-body">
        <div class="form-group">
          <label>群名称</label>
          <input v-model="form.name" class="input" placeholder="例如：三国演义讨论组" />
        </div>

        <div class="form-group">
          <label>系统提示词（最高优先级）</label>
          <textarea
            v-model="form.systemPrompt"
            class="input textarea"
            placeholder="例如：你是一个专业的角色扮演助手，请根据角色设定进行对话，保持角色的性格特点和说话风格..."
            rows="4"
          />
          <small class="hint">
            全局系统提示词，优先级最高，会在每次调用LLM时首先发送，用于指导AI的整体回复风格和行为
          </small>
        </div>

        <div class="form-group">
          <label>群背景设定</label>
          <textarea
            v-model="form.background"
            class="input textarea"
            placeholder="例如：这是一个三国时期的讨论群，各位角色根据自己的历史背景和性格特点参与对话..."
            rows="6"
          />
          <small class="hint">
            设定群背景和场景，会在系统提示词之后、角色人设之前发送，帮助AI更好地理解对话环境
          </small>
        </div>

        <div class="form-group">
          <label>最大历史轮数</label>
          <input
            v-model.number="form.maxHistory"
            type="number"
            class="input"
            min="1"
            max="50"
          />
          <small class="hint">
            控制发送给LLM的历史消息数量，越大越连贯但消耗更多token
          </small>
        </div>

        <div class="form-group">
          <label>回复模式</label>
          <select v-model="form.responseMode" class="input">
            <option value="sequential">顺序模式</option>
            <option value="parallel">并行模式</option>
          </select>
          <small class="hint">
            顺序模式：角色依次回复，后回复的角色能看到前面的回复
            并行模式：所有角色同时回复，互不干扰
          </small>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input
              v-model="form.thinkingEnabled"
              type="checkbox"
            />
            <span>启用思考模式</span>
          </label>
          <small class="hint">
            启用后，模型会在回复前展示思考过程（适用于支持思考模式的模型）
          </small>
        </div>

        <div class="info-section">
          <div class="info-item">
            <span class="label">LLM 供应商：</span>
            <span>{{ getProviderName(group.llm_provider) }}</span>
          </div>
          <div class="info-item">
            <span class="label">模型：</span>
            <span>{{ group.llm_model }}</span>
          </div>
          <div class="info-item">
            <span class="label">API Key：</span>
            <span>{{ group.llm_api_key ? '已配置' : '使用全局配置' }}</span>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" @click="handleSave" :disabled="!hasChanges">
          保存
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'

const props = defineProps({
  groupId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'saved'])

const groupsStore = useGroupsStore()

const group = computed(() => groupsStore.groups.find(g => g.id === props.groupId))

const form = ref({
  name: '',
  systemPrompt: '',
  background: '',
  maxHistory: 10,
  responseMode: 'sequential',
  thinkingEnabled: false
})

const hasChanges = computed(() => {
  if (!group.value) return false
  return (
    form.value.name !== group.value.name ||
    (form.value.systemPrompt || '') !== (group.value.system_prompt || '') ||
    (form.value.background || '') !== (group.value.background || '') ||
    form.value.maxHistory !== group.value.max_history ||
    form.value.responseMode !== group.value.response_mode ||
    form.value.thinkingEnabled !== (group.value.thinking_enabled === 1)
  )
})

onMounted(() => {
  if (group.value) {
    form.value = {
      name: group.value.name,
      systemPrompt: group.value.system_prompt || '',
      background: group.value.background || '',
      maxHistory: group.value.max_history,
      responseMode: group.value.response_mode,
      thinkingEnabled: group.value.thinking_enabled === 1
    }
  }
})

function getProviderName(providerId) {
  const provider = LLM_PROVIDERS[providerId]
  return provider ? provider.name : providerId
}

async function handleSave() {
  if (!hasChanges.value) return

  try {
    await groupsStore.updateGroup(props.groupId, {
      name: form.value.name,
      systemPrompt: form.value.systemPrompt || null,
      background: form.value.background || null,
      maxHistory: form.value.maxHistory,
      responseMode: form.value.responseMode,
      thinkingEnabled: form.value.thinkingEnabled
    })
    emit('saved')
  } catch (error) {
    alert('保存群设置失败: ' + error.message)
  }
}
</script>

<style lang="scss" scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog {
  background: $bg-primary;
  border-radius: $border-radius-lg;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.dialog-header {
  padding: $spacing-lg $spacing-xl;
  border-bottom: 1px solid $border-color;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: $text-secondary;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: $text-primary;
    }
  }
}

.dialog-body {
  padding: $spacing-xl;
}

.form-group {
  margin-bottom: $spacing-lg;

  label {
    display: block;
    margin-bottom: $spacing-sm;
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  .input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid $border-color;
    border-radius: $border-radius-md;
    font-size: $font-size-md;
    background: $bg-primary;
    color: $text-primary;
    transition: border-color 0.2s;

    &:focus {
      outline: none;
      border-color: $color-primary;
    }

    &::placeholder {
      color: $text-placeholder;
    }

    &.textarea {
      resize: vertical;
      min-height: 120px;
      font-family: inherit;
      line-height: 1.5;
    }
  }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  cursor: pointer;
  user-select: none;

  input[type="checkbox"] {
    cursor: pointer;
    width: 16px;
    height: 16px;
  }

  span {
    font-size: $font-size-md;
    color: $text-primary;
  }
}

.hint {
  display: block;
  margin-top: $spacing-xs;
  font-size: $font-size-xs;
  color: $text-secondary;
  line-height: 1.4;
}

.info-section {
  padding: $spacing-md;
  background: $bg-secondary;
  border-radius: $border-radius-md;
  margin-top: $spacing-lg;

  .info-item {
    display: flex;
    align-items: center;
    font-size: $font-size-sm;
    margin-bottom: $spacing-xs;

    &:last-child {
      margin-bottom: 0;
    }

    .label {
      font-weight: $font-weight-medium;
      color: $text-secondary;
      margin-right: $spacing-sm;
    }
  }
}

.dialog-footer {
  padding: $spacing-lg $spacing-xl;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
}
</style>
