<template>
  <BaseDialog title="群设置" max-width="600px" @close="$emit('close')">
    <FormGroup label="群名称">
      <input v-model="form.name" class="input" placeholder="例如：三国演义讨论组" />
    </FormGroup>

    <FormGroup label="系统提示词（最高优先级）" hint="全局系统提示词，优先级最高，会在每次调用LLM时首先发送，用于指导AI的整体回复风格和行为">
      <textarea
        v-model="form.systemPrompt"
        class="input textarea"
        placeholder="例如：你是一个专业的角色扮演助手，请根据角色设定进行对话，保持角色的性格特点和说话风格..."
        rows="4"
      />
    </FormGroup>

    <FormGroup label="群背景设定" hint="设定群背景和场景，会在系统提示词之后、角色人设之前发送，帮助AI更好地理解对话环境">
      <textarea
        v-model="form.background"
        class="input textarea"
        placeholder="例如：这是一个三国时期的讨论群，各位角色根据自己的历史背景和性格特点参与对话..."
        rows="6"
      />
    </FormGroup>

    <FormGroup label="最大历史轮数" hint="控制发送给LLM的历史消息数量，越大越连贯但消耗更多token">
      <input v-model.number="form.maxHistory" type="number" class="input number-input" min="1" max="50" />
    </FormGroup>

    <FormGroup label="回复模式">
      <div class="radio-group">
        <label class="radio-option">
          <input type="radio" v-model="form.responseMode" value="sequential" />
          <span>顺序模式</span>
        </label>
        <label class="radio-option">
          <input type="radio" v-model="form.responseMode" value="parallel" />
          <span>并行模式</span>
        </label>
      </div>
    </FormGroup>

    <FormGroup hint="启用后，模型会在回复前展示思考过程（适用于支持思考模式的模型）">
      <label class="checkbox-label">
        <input v-model="form.thinkingEnabled" type="checkbox" />
        <span>启用思考模式</span>
      </label>
    </FormGroup>

    <FormGroup hint="启用后，角色在顺序模式下会以随机顺序依次回复">
      <label class="checkbox-label">
        <input v-model="form.randomOrder" type="checkbox" />
        <span>随机发言</span>
      </label>
    </FormGroup>

    <FormGroup hint="启用后，LLM 会在每次对话后自动从对话中提取角色的关键信息（喜好、经历、关系等），形成跨群共享的记忆">
      <label class="checkbox-label">
        <input v-model="form.autoMemoryExtract" type="checkbox" />
        <span>自动提取角色记忆</span>
      </label>
    </FormGroup>

    <div class="form-section">
      <h4>叙事引擎</h4>
      <FormGroup>
        <label class="checkbox-label">
          <input v-model="form.narrativeEnabled" type="checkbox" />
          <span>启用叙事引擎（情绪、关系、事件系统）</span>
        </label>
      </FormGroup>
      <FormGroup v-if="form.narrativeEnabled">
        <label class="checkbox-label">
          <input v-model="form.aftermathEnabled" type="checkbox" />
          <span>启用角色间余波互动</span>
        </label>
      </FormGroup>
      <FormGroup v-if="form.narrativeEnabled" label="事件场景类型">
        <select v-model="form.eventSceneType" class="input">
          <option v-for="opt in sceneOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </FormGroup>
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

    <template #footer>
      <button class="btn btn-secondary" @click="$emit('close')">取消</button>
      <button class="btn btn-primary" @click="handleSave" :disabled="!hasChanges">保存</button>
    </template>
  </BaseDialog>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useToastStore } from '../../stores/toast'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'
import BaseDialog from '../common/BaseDialog.vue'
import FormGroup from '../common/FormGroup.vue'

const props = defineProps({ groupId: { type: String, required: true } })
const emit = defineEmits(['close', 'saved'])

const groupsStore = useGroupsStore()
const toast = useToastStore()
const group = computed(() => groupsStore.groups.find(g => g.id === props.groupId))
const sceneOptions = ref([{ value: 'general', label: '通用' }])

const form = ref({
  name: '', systemPrompt: '', background: '',
  maxHistory: 20, responseMode: 'sequential',
  thinkingEnabled: false, randomOrder: false, autoMemoryExtract: false,
  narrativeEnabled: true, aftermathEnabled: true, eventSceneType: 'general'
})

const hasChanges = computed(() => {
  if (!group.value) return false
  return (
    form.value.name !== group.value.name ||
    (form.value.systemPrompt || '') !== (group.value.system_prompt || '') ||
    (form.value.background || '') !== (group.value.background || '') ||
    form.value.maxHistory !== group.value.max_history ||
    form.value.responseMode !== group.value.response_mode ||
    form.value.thinkingEnabled !== (group.value.thinking_enabled === 1) ||
    form.value.randomOrder !== (group.value.random_order === 1) ||
    form.value.autoMemoryExtract !== (group.value.auto_memory_extract === 1) ||
    form.value.narrativeEnabled !== (group.value.narrative_enabled === 1) ||
    form.value.aftermathEnabled !== (group.value.aftermath_enabled === 1) ||
    (form.value.eventSceneType || 'general') !== (group.value.event_scene_type || 'general')
  )
})

onMounted(async () => {
  const labelResult = await window.electronAPI.narrative.getSceneLabels()
  if (labelResult.success) {
    sceneOptions.value = Object.entries(labelResult.data).map(([value, label]) => ({ value, label }))
  }
  if (group.value) {
    form.value = {
      name: group.value.name,
      systemPrompt: group.value.system_prompt || '',
      background: group.value.background || '',
      maxHistory: group.value.max_history,
      responseMode: group.value.response_mode,
      thinkingEnabled: group.value.thinking_enabled === 1,
      randomOrder: group.value.random_order === 1,
      autoMemoryExtract: group.value.auto_memory_extract === 1,
      narrativeEnabled: group.value.narrative_enabled === 1,
      aftermathEnabled: group.value.aftermath_enabled === 1,
      eventSceneType: group.value.event_scene_type || 'general'
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
      thinkingEnabled: form.value.thinkingEnabled,
      randomOrder: form.value.randomOrder,
      autoMemoryExtract: form.value.autoMemoryExtract,
      narrativeEnabled: form.value.narrativeEnabled,
      aftermathEnabled: form.value.aftermathEnabled,
      eventSceneType: form.value.eventSceneType || 'general'
    })
    emit('saved')
    emit('close')
  } catch (error) {
    toast.error('保存群设置失败: ' + error.message)
  }
}
</script>

<style lang="scss" scoped>
.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  font-size: $font-size-md;
  background: $bg-primary;
  color: $text-primary;
  transition: border-color 0.2s;

  &:focus { outline: none; border-color: $color-primary; }
  &::placeholder { color: $text-placeholder; }

  &.textarea {
    resize: vertical;
    min-height: 120px;
    font-family: inherit;
    line-height: 1.5;
  }
}

.number-input { width: 100px; }

.radio-group {
  display: flex;
  gap: $spacing-lg;
  padding: $spacing-sm 0;

  .radio-option {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    cursor: pointer;
    user-select: none;

    input[type="radio"] { cursor: pointer; width: 16px; height: 16px; accent-color: $color-primary; }
    span { font-size: $font-size-md; color: $text-primary; }
    &:hover span { color: $color-primary; }
  }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  cursor: pointer;
  user-select: none;

  input[type="checkbox"] { cursor: pointer; width: 16px; height: 16px; }
  span { font-size: $font-size-md; color: $text-primary; }
}

.form-section {
  margin-bottom: $spacing-lg;

  h4 {
    font-size: 14px;
    color: #333;
    margin: 0 0 $spacing-md;
    padding-bottom: $spacing-xs;
    border-bottom: 1px solid #eee;
  }
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
    &:last-child { margin-bottom: 0; }
    .label { font-weight: $font-weight-medium; color: $text-secondary; margin-right: $spacing-sm; }
  }
}
</style>
