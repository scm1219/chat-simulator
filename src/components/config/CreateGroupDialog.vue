<template>
  <BaseDialog title="创建聊天群" max-width="500px" @close="$emit('close')">
    <FormGroup label="群名称">
      <input v-model="form.name" class="input" placeholder="例如：三国演义讨论组" />
    </FormGroup>

    <FormGroup label="LLM 配置">
      <select v-model="form.selectedProfileId" class="input" :disabled="loadingProfiles">
        <option value="">-- 请选择配置 --</option>
        <option v-for="profile in llmProfiles" :key="profile.id" :value="profile.id">
          {{ profile.name }} ({{ getProviderName(profile.provider) }} - {{ profile.model }})
        </option>
      </select>
      <div class="form-actions-inline">
        <button class="btn-link" @click="openProfileManager">⚙️ 管理配置</button>
      </div>
    </FormGroup>

    <div v-if="selectedProfile" class="profile-preview">
      <div class="preview-item">
        <span class="label">供应商：</span>
        <span>{{ getProviderName(selectedProfile.provider) }}</span>
      </div>
      <div class="preview-item">
        <span class="label">模型：</span>
        <span>{{ selectedProfile.model }}</span>
      </div>
    </div>

    <FormGroup label="最大历史轮数">
      <input v-model.number="form.maxHistory" type="number" class="input" min="1" max="50" />
    </FormGroup>

    <FormGroup>
      <label class="checkbox-label">
        <input v-model="form.thinkingEnabled" type="checkbox" />
        <span>启用思考模式</span>
      </label>
      <template #hint>启用后，模型会在回复前展示思考过程（适用于支持思考模式的模型）</template>
    </FormGroup>

    <FormGroup>
      <label class="checkbox-label">
        <input v-model="form.randomOrder" type="checkbox" />
        <span>随机发言</span>
      </label>
      <template #hint>启用后，角色在顺序模式下会以随机顺序依次回复</template>
    </FormGroup>

    <FormGroup label="系统提示词模板（可多选）">
      <div v-if="loadingTemplates" class="loading-text">加载模板中...</div>
      <div v-else class="template-grid">
        <div
          v-for="template in templates"
          :key="template.id"
          class="template-item"
          :class="{ selected: selectedTemplateIds.includes(template.id) }"
          @click="toggleTemplate(template.id)"
        >
          <div class="template-header">
            <span class="template-checkbox">{{ selectedTemplateIds.includes(template.id) ? '✓' : '' }}</span>
            <span class="template-name">{{ template.name }}</span>
          </div>
          <span class="template-category">{{ template.category }}</span>
        </div>
      </div>
      <div class="form-actions-inline">
        <button class="btn-link" @click="applyTemplates" :disabled="selectedTemplateIds.length === 0">
          📥 应用选中模板（{{ selectedTemplateIds.length }}）
        </button>
        <button class="btn-link" @click="clearTemplates">🗑️ 清空选择</button>
      </div>
    </FormGroup>

    <FormGroup label="系统提示词（最高优先级）">
      <textarea
        v-model="form.systemPrompt"
        class="input textarea"
        placeholder="例如：你是一个专业的角色扮演助手，请根据角色设定进行对话，保持角色的性格特点和说话风格..."
        rows="5"
      />
      <template #hint>
        可选。全局系统提示词，优先级最高，用于指导AI的整体回复风格和行为。可从上方选择模板快速填充。
      </template>
    </FormGroup>

    <FormGroup label="群背景设定">
      <textarea
        v-model="form.background"
        class="input textarea"
        placeholder="例如：这是一个三国时期的讨论群，各位角色根据自己的历史背景和性格特点参与对话..."
        rows="4"
      />
      <template #hint>
        可选。设定群背景和场景，会在系统提示词之后发送，帮助AI更好地理解对话环境
      </template>
    </FormGroup>

    <template #footer>
      <button class="btn btn-secondary" @click="$emit('close')">取消</button>
      <button class="btn btn-primary" @click="handleCreate" :disabled="!canCreate">创建</button>
    </template>

    <LLMProfileDialog v-if="showProfileManager" @close="closeProfileManager" />
  </BaseDialog>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useToastStore } from '../../stores/toast'
import { useApi } from '../../composables/useApi.js'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'
import BaseDialog from '../common/BaseDialog.vue'
import FormGroup from '../common/FormGroup.vue'
import LLMProfileDialog from './LLMProfileDialog.vue'

const emit = defineEmits(['close', 'created'])
const toast = useToastStore()
const groupsStore = useGroupsStore()
const profilesStore = useLLMProfilesStore()
const { load: loadApi } = useApi('CreateGroup')

const form = ref({
  name: '',
  selectedProfileId: '',
  maxHistory: 20,
  thinkingEnabled: false,
  randomOrder: false,
  systemPrompt: '你是一个"多角色对话模拟器"。任务是根据提供的场景和人物设定，生成符合人物性格的对话内容。如果设定是日常对话场景，那么每个角色的回复在符合人设的情况下保持简洁',
  background: ''
})

const providerOrder = Object.keys(LLM_PROVIDERS)
const llmProfiles = computed(() => {
  return [...profilesStore.profiles].sort((a, b) => {
    const ai = providerOrder.indexOf(a.provider)
    const bi = providerOrder.indexOf(b.provider)
    if (ai !== bi) return ai - bi
    return a.name.localeCompare(b.name)
  })
})
const loadingProfiles = computed(() => profilesStore.loading)
const showProfileManager = ref(false)
const templates = ref([])
const loadingTemplates = ref(false)
const selectedTemplateIds = ref([])

const selectedProfile = computed(() => {
  if (!form.value.selectedProfileId) return null
  return profilesStore.getProfileById(form.value.selectedProfileId)
})

const canCreate = computed(() => {
  return form.value.name.trim().length > 0 && form.value.selectedProfileId !== ''
})

onMounted(async () => {
  await profilesStore.loadProfiles()
  await loadTemplates()
})

async function loadTemplates() {
  loadingTemplates.value = true
  try {
    const result = await window.electronAPI.config.systemPrompt.getAll()
    if (result.success) templates.value = result.data
  } catch (error) {
    console.error('加载模板失败', error)
  } finally {
    loadingTemplates.value = false
  }
}

function toggleTemplate(templateId) {
  const index = selectedTemplateIds.value.indexOf(templateId)
  if (index === -1) selectedTemplateIds.value.push(templateId)
  else selectedTemplateIds.value.splice(index, 1)
}

function applyTemplates() {
  const selected = templates.value.filter(t => selectedTemplateIds.value.includes(t.id))
  if (selected.length === 0) return
  const merged = selected.map(t => t.content).join('\n\n')
  form.value.systemPrompt = form.value.systemPrompt.trim()
    ? form.value.systemPrompt.trim() + '\n\n' + merged
    : merged
}

function clearTemplates() {
  selectedTemplateIds.value = []
}

function getProviderName(providerId) {
  const provider = LLM_PROVIDERS[providerId]
  return provider ? provider.name : providerId
}

function openProfileManager() { showProfileManager.value = true }
function closeProfileManager() { showProfileManager.value = false }

async function handleCreate() {
  if (!canCreate.value) return
  try {
    const profile = selectedProfile.value
    const groupData = {
      name: form.value.name,
      llmProvider: profile.provider,
      llmModel: profile.model,
      llmApiKey: profile.apiKey,
      llmBaseUrl: profile.baseURL,
      useGlobalApiKey: false,
      maxHistory: form.value.maxHistory,
      thinkingEnabled: form.value.thinkingEnabled,
      randomOrder: form.value.randomOrder,
      systemPrompt: form.value.systemPrompt || null,
      background: form.value.background || null
    }
    const group = await groupsStore.createGroup(groupData)
    emit('created', group)
  } catch (error) {
    toast.error('创建群组失败: ' + error.message)
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

  &:focus {
    outline: none;
    border-color: $color-primary;
  }

  &::placeholder { color: $text-placeholder; }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: $bg-secondary;
  }

  &.textarea {
    resize: vertical;
    min-height: 80px;
    font-family: inherit;
    line-height: 1.5;
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

.form-actions-inline {
  margin-top: $spacing-sm;
  display: flex;
  gap: $spacing-md;

  .btn-link:disabled { opacity: 0.5; cursor: not-allowed; }
}

.btn-link {
  background: none;
  border: none;
  color: $color-primary;
  font-size: $font-size-sm;
  cursor: pointer;
  padding: 0;

  &:hover { text-decoration: underline; }
}

.profile-preview {
  padding: $spacing-md;
  background: $bg-secondary;
  border-radius: $border-radius-md;
  margin-bottom: $spacing-lg;

  .preview-item {
    display: flex;
    align-items: center;
    font-size: $font-size-sm;
    margin-bottom: $spacing-xs;

    &:last-child { margin-bottom: 0; }

    .label {
      font-weight: $font-weight-medium;
      color: $text-secondary;
      margin-right: $spacing-sm;
    }
  }
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: $spacing-sm;
  margin-bottom: $spacing-sm;
  max-height: 200px;
  overflow-y: auto;
  padding: $spacing-xs;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
}

.template-item {
  padding: $spacing-sm;
  border: 1px solid $border-color;
  border-radius: $border-radius-sm;
  cursor: pointer;
  transition: all 0.2s;
  background: $bg-secondary;

  &:hover {
    border-color: $color-primary;
    background: rgba($color-primary, 0.05);
  }

  &.selected {
    border-color: $color-primary;
    background: rgba($color-primary, 0.1);
    .template-checkbox { background: $color-primary; color: white; border-color: $color-primary; }
  }

  .template-header {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    margin-bottom: 4px;
  }

  .template-checkbox {
    width: 16px; height: 16px;
    border: 1px solid $border-color;
    border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: bold; flex-shrink: 0;
  }

  .template-name {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-primary;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .template-category {
    font-size: $font-size-xs;
    color: $text-secondary;
    background: rgba($color-primary, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
  }
}

.loading-text {
  color: $text-secondary;
  font-size: $font-size-sm;
  padding: $spacing-md;
  text-align: center;
}
</style>
