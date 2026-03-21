<template>
  <div class="dialog-overlay">
    <div class="dialog" @click.stop>
      <div class="dialog-header">
        <h3>创建聊天群</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="dialog-body">
        <div class="form-group">
          <label>群名称</label>
          <input v-model="form.name" class="input" placeholder="例如：三国演义讨论组" />
        </div>

        <div class="form-group">
          <label>LLM 配置</label>
          <select v-model="form.selectedProfileId" class="input" :disabled="loadingProfiles">
            <option value="">-- 请选择配置 --</option>
            <option
              v-for="profile in llmProfiles"
              :key="profile.id"
              :value="profile.id"
            >
              {{ profile.name }} ({{ getProviderName(profile.provider) }} - {{ profile.model }})
            </option>
          </select>
          <div class="form-actions-inline">
            <button class="btn-link" @click="openProfileManager">
              ⚙️ 管理配置
            </button>
          </div>
        </div>

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

        <div class="form-group">
          <label>最大历史轮数</label>
          <input
            v-model.number="form.maxHistory"
            type="number"
            class="input"
            min="1"
            max="50"
          />
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

        <!-- 系统提示词模板选择 -->
        <div class="form-group">
          <label>系统提示词模板（可多选）</label>
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
                <span class="template-checkbox">
                  {{ selectedTemplateIds.includes(template.id) ? '✓' : '' }}
                </span>
                <span class="template-name">{{ template.name }}</span>
              </div>
              <span class="template-category">{{ template.category }}</span>
            </div>
          </div>
          <div class="form-actions-inline">
            <button class="btn-link" @click="applyTemplates" :disabled="selectedTemplateIds.length === 0">
              📥 应用选中模板（{{ selectedTemplateIds.length }}）
            </button>
            <button class="btn-link" @click="clearTemplates">
              🗑️ 清空选择
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>系统提示词（最高优先级）</label>
          <textarea
            v-model="form.systemPrompt"
            class="input textarea"
            placeholder="例如：你是一个专业的角色扮演助手，请根据角色设定进行对话，保持角色的性格特点和说话风格..."
            rows="5"
          />
          <small class="hint">
            可选。全局系统提示词，优先级最高，用于指导AI的整体回复风格和行为。可从上方选择模板快速填充。
          </small>
        </div>

        <div class="form-group">
          <label>群背景设定</label>
          <textarea
            v-model="form.background"
            class="input textarea"
            placeholder="例如：这是一个三国时期的讨论群，各位角色根据自己的历史背景和性格特点参与对话..."
            rows="4"
          />
          <small class="hint">
            可选。设定群背景和场景，会在系统提示词之后发送，帮助AI更好地理解对话环境
          </small>
        </div>
      </div>

      <div class="dialog-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" @click="handleCreate" :disabled="!canCreate">
          创建
        </button>
      </div>

      <!-- 配置管理对话框 -->
      <LLMProfileDialog
        v-if="showProfileManager"
        @close="closeProfileManager"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useToastStore } from '../../stores/toast'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'
import LLMProfileDialog from './LLMProfileDialog.vue'

const emit = defineEmits(['close', 'created'])
const toast = useToastStore()

const groupsStore = useGroupsStore()
const profilesStore = useLLMProfilesStore()

const form = ref({
  name: '',
  selectedProfileId: '',
  maxHistory: 20,
  thinkingEnabled: false,
  systemPrompt: '',
  background: ''
})

const llmProfiles = computed(() => profilesStore.profiles)
const loadingProfiles = computed(() => profilesStore.loading)
const showProfileManager = ref(false)

// 系统提示词模板相关
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

// 加载配置列表和模板
onMounted(async () => {
  await profilesStore.loadProfiles()
  await loadTemplates()
})

// 加载系统提示词模板
async function loadTemplates() {
  loadingTemplates.value = true
  try {
    const result = await window.electronAPI.config.systemPrompt.getAll()
    if (result.success) {
      templates.value = result.data
    }
  } catch (error) {
    console.error('[CreateGroup] 加载模板失败', error)
  } finally {
    loadingTemplates.value = false
  }
}

// 切换模板选择
function toggleTemplate(templateId) {
  const index = selectedTemplateIds.value.indexOf(templateId)
  if (index === -1) {
    selectedTemplateIds.value.push(templateId)
  } else {
    selectedTemplateIds.value.splice(index, 1)
  }
}

// 应用选中的模板到系统提示词
function applyTemplates() {
  const selectedTemplates = templates.value.filter(t => selectedTemplateIds.value.includes(t.id))
  if (selectedTemplates.length === 0) return

  // 将选中模板的内容合并，用换行分隔
  const contents = selectedTemplates.map(t => t.content)
  const mergedContent = contents.join('\n\n')

  // 如果当前已有内容，追加到后面
  if (form.value.systemPrompt.trim()) {
    form.value.systemPrompt = form.value.systemPrompt.trim() + '\n\n' + mergedContent
  } else {
    form.value.systemPrompt = mergedContent
  }
}

// 清空模板选择
function clearTemplates() {
  selectedTemplateIds.value = []
}

// 获取供应商名称
function getProviderName(providerId) {
  const provider = LLM_PROVIDERS[providerId]
  return provider ? provider.name : providerId
}

// 打开配置管理
function openProfileManager() {
  showProfileManager.value = true
}

// 关闭配置管理
function closeProfileManager() {
  showProfileManager.value = false
}

async function handleCreate() {
  if (!canCreate.value) return

  try {
    const profile = selectedProfile.value

    // 构建群组数据
    const groupData = {
      name: form.value.name,
      llmProvider: profile.provider,
      llmModel: profile.model,
      llmApiKey: profile.apiKey,
      llmBaseUrl: profile.baseURL,
      useGlobalApiKey: false,
      maxHistory: form.value.maxHistory,
      thinkingEnabled: form.value.thinkingEnabled,
      systemPrompt: form.value.systemPrompt || null,
      background: form.value.background || null
    }

    console.log('[CreateGroup] 准备创建群组', {
      profileName: profile.name,
      hasApiKey: !!profile.apiKey,
      hasBaseUrl: !!profile.baseURL,
      groupData
    })

    const group = await groupsStore.createGroup(groupData)
    emit('created', group)
    toast.success('群组创建成功')
  } catch (error) {
    console.error('[CreateGroup] 创建失败', error)
    toast.error('创建群组失败: ' + error.message)
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
  max-width: 500px;
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
}

.form-actions-inline {
  margin-top: $spacing-sm;
  display: flex;
  gap: $spacing-md;

  .btn-link:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

.btn-link {
  background: none;
  border: none;
  color: $color-primary;
  font-size: $font-size-sm;
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
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

// 模板选择器样式
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

    .template-checkbox {
      background: $color-primary;
      color: white;
      border-color: $color-primary;
    }
  }

  .template-header {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    margin-bottom: 4px;
  }

  .template-checkbox {
    width: 16px;
    height: 16px;
    border: 1px solid $border-color;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .template-name {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

.dialog-footer {
  padding: $spacing-lg $spacing-xl;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
}
</style>
