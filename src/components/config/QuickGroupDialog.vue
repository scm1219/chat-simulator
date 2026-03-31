<template>
  <div class="dialog-overlay" @click.self="closeDialog">
    <div class="dialog">
      <div class="dialog-header">
        <h3>AI 快速建群</h3>
        <button class="btn-close" @click="closeDialog">×</button>
      </div>

      <!-- Tab 头部 -->
      <div class="tab-header">
        <button
          :class="['tab-btn', { active: activeTab === 'create' }]"
          @click="activeTab = 'create'"
        >
          快速建群
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'prompt' }]"
          @click="switchToPromptTab"
        >
          提示词设置
        </button>
      </div>

      <div class="dialog-body">
        <!-- Tab: 快速建群 -->
        <div v-show="activeTab === 'create'" class="tab-content">
          <!-- 步骤 1：输入描述 -->
          <div v-if="step === 'input'" class="step-input">
            <div class="form-group">
              <label class="form-label">群组描述</label>
              <textarea
                v-model="description"
                class="input textarea"
                placeholder="例如：办公室白领聊天群，3个女性，1个男性&#10;例如：三国时期的谋士讨论会，5个角色&#10;例如：大学宿舍聊天，4个室友，2男2女"
                rows="5"
                maxlength="500"
              ></textarea>
              <div class="form-hint">{{ description.length }}/500</div>
            </div>

            <div class="input-tip">
              <p>描述你想要的群组类型、角色数量和特征，AI 会为你生成完整的群组方案</p>
            </div>
          </div>

          <!-- 步骤 2：预览与编辑 -->
          <div v-else-if="step === 'preview'" class="step-preview">
            <!-- 群组基本信息 -->
            <div class="preview-section">
              <h4 class="section-title">群组信息</h4>
              <div class="form-group">
                <label class="form-label">群名称</label>
                <input v-model="preview.name" class="input" placeholder="群名称" />
              </div>
              <div class="form-group">
                <label class="form-label">群背景设定</label>
                <textarea
                  v-model="preview.background"
                  class="input textarea"
                  rows="4"
                  placeholder="群背景设定..."
                ></textarea>
              </div>
            </div>

            <!-- 角色列表 -->
            <div class="preview-section">
              <div class="section-header">
                <h4 class="section-title">角色列表（{{ preview.characters.length }}个）</h4>
              </div>
              <div class="character-list">
                <div
                  v-for="(char, index) in preview.characters"
                  :key="index"
                  class="character-card"
                >
                  <div class="card-header">
                    <span class="card-index">#{{ index + 1 }}</span>
                    <button class="btn-icon-small btn-danger" @click="removeCharacter(index)" title="移除角色">
                      ×
                    </button>
                  </div>
                  <div class="card-body">
                    <div class="card-row">
                      <div class="card-field card-field-name">
                        <label class="field-label">姓名</label>
                        <input v-model="char.name" class="input input-sm" placeholder="角色名称" />
                      </div>
                      <div class="card-field">
                        <label class="field-label">性别</label>
                        <select v-model="char.gender" class="input input-sm">
                          <option value="male">男</option>
                          <option value="female">女</option>
                          <option value="other">其他</option>
                        </select>
                      </div>
                      <div class="card-field">
                        <label class="field-label">年龄</label>
                        <input v-model.number="char.age" type="number" class="input input-sm" min="1" max="200" />
                      </div>
                    </div>
                    <div class="card-field card-field-full">
                      <label class="field-label">人物设定</label>
                      <textarea
                        v-model="char.systemPrompt"
                        class="input textarea textarea-sm"
                        rows="3"
                        placeholder="角色设定..."
                      ></textarea>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- LLM 配置选择 -->
            <div class="preview-section">
              <h4 class="section-title">LLM 配置</h4>
              <div class="form-group">
                <select v-model="selectedProfileId" class="input" :disabled="loadingProfiles">
                  <option value="">-- 请选择配置 --</option>
                  <option
                    v-for="profile in llmProfiles"
                    :key="profile.id"
                    :value="profile.id"
                  >
                    {{ profile.name }} ({{ getProviderName(profile.provider) }} - {{ profile.model }})
                  </option>
                </select>
              </div>

              <!-- 保存到角色库选项 -->
              <label class="checkbox-label">
                <input v-model="saveToLibrary" type="checkbox" />
                <span>同时保存角色到全局角色库</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Tab: 提示词设置 -->
        <div v-show="activeTab === 'prompt'" class="tab-content">
          <div v-if="promptLoading" class="prompt-loading">加载中...</div>
          <div v-else class="prompt-settings">
            <div class="form-group">
              <label class="form-label">
                系统提示词
                <span class="label-hint">（发给 LLM 的群组生成指令）</span>
              </label>
              <textarea
                v-model="promptForm.systemPrompt"
                class="input textarea textarea-code"
                rows="14"
                placeholder="系统提示词..."
              ></textarea>
              <div class="form-hint">{{ promptForm.systemPrompt.length }} 字符</div>
            </div>

            <div class="form-group">
              <label class="form-label">
                用户提示模板
                <span class="label-hint">（{description} 将替换为用户输入）</span>
              </label>
              <input
                v-model="promptForm.userPromptTemplate"
                class="input"
                placeholder="例如：请根据以下描述生成一个聊天群组：{description}"
              />
            </div>

            <div class="form-group">
              <label class="form-label">默认提示（无用户输入时使用）</label>
              <input
                v-model="promptForm.defaultUserPrompt"
                class="input"
                placeholder="例如：请随机生成一个有趣的多人聊天群组，包含4-6个角色"
              />
            </div>

            <div class="prompt-actions">
              <button class="btn btn-text" @click="handleResetPrompt">
                恢复默认
              </button>
              <button
                class="btn btn-primary"
                :disabled="!promptDirty"
                @click="handleSavePrompt"
              >
                {{ promptSaving ? '保存中...' : '保存' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <template v-if="activeTab === 'create'">
          <button class="btn btn-secondary" @click="handleCancel">
            {{ step === 'input' ? '关闭' : '取消' }}
          </button>
          <button
            v-if="step === 'input'"
            class="btn btn-ai"
            :disabled="generating || !description.trim()"
            @click="handleGenerate"
          >
            {{ generating ? '生成中...' : 'AI 生成' }}
          </button>
          <template v-if="step === 'preview'">
            <button class="btn btn-secondary" @click="step = 'input'">
              重新生成
            </button>
            <button
              class="btn btn-primary"
              :disabled="!canCreate"
              @click="handleConfirm"
            >
              {{ creating ? '创建中...' : '确认创建' }}
            </button>
          </template>
        </template>
        <template v-else>
          <button class="btn btn-secondary" @click="closeDialog">关闭</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useCharactersStore } from '../../stores/characters.js'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useGlobalCharactersStore } from '../../stores/global-characters.js'
import { useToastStore } from '../../stores/toast'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'

const emit = defineEmits(['close', 'created'])

const groupsStore = useGroupsStore()
const charactersStore = useCharactersStore()
const profilesStore = useLLMProfilesStore()
const globalCharsStore = useGlobalCharactersStore()
const toast = useToastStore()

// ============ Tab 状态 ============
const activeTab = ref('create')

// ============ 快速建群状态 ============
const step = ref('input') // 'input' | 'preview'
const description = ref('')
const generating = ref(false)
const creating = ref(false)
const selectedProfileId = ref('')
const saveToLibrary = ref(false)

const preview = reactive({
  name: '',
  background: '',
  characters: []
})

const llmProfiles = computed(() => profilesStore.profiles)
const loadingProfiles = computed(() => profilesStore.loading)

const canCreate = computed(() => {
  return (
    preview.name.trim().length > 0 &&
    preview.characters.length > 0 &&
    preview.characters.every(c => c.name.trim() && c.systemPrompt.trim()) &&
    selectedProfileId.value !== ''
  )
})

// ============ 提示词设置状态 ============
const promptLoading = ref(false)
const promptSaving = ref(false)
const promptForm = reactive({
  systemPrompt: '',
  userPromptTemplate: '',
  defaultUserPrompt: ''
})
const savedPrompt = reactive({
  systemPrompt: '',
  userPromptTemplate: '',
  defaultUserPrompt: ''
})

const promptDirty = computed(() => {
  return (
    promptForm.systemPrompt !== savedPrompt.systemPrompt ||
    promptForm.userPromptTemplate !== savedPrompt.userPromptTemplate ||
    promptForm.defaultUserPrompt !== savedPrompt.defaultUserPrompt
  )
})

// ============ 方法 ============

function getProviderName(providerId) {
  const provider = LLM_PROVIDERS[providerId]
  return provider ? provider.name : providerId
}

function closeDialog() {
  emit('close')
}

function handleCancel() {
  if (step.value === 'preview') {
    step.value = 'input'
  } else {
    closeDialog()
  }
}

function removeCharacter(index) {
  preview.characters.splice(index, 1)
}

// AI 生成群组信息
async function handleGenerate() {
  if (!description.value.trim()) return

  generating.value = true
  try {
    const result = await window.electronAPI.llm.generateGroup(description.value.trim())

    if (result.success) {
      preview.name = result.data.name || ''
      preview.background = result.data.background || ''
      preview.characters = (result.data.characters || []).map(c => ({
        name: c.name || '',
        gender: c.gender || 'other',
        age: c.age || 20,
        systemPrompt: c.systemPrompt || ''
      }))

      // 自动选择第一个 LLM 配置
      if (llmProfiles.value.length > 0 && !selectedProfileId.value) {
        selectedProfileId.value = llmProfiles.value[0].id
      }

      step.value = 'preview'
      toast.success('群组方案生成成功！')
    } else {
      toast.error('生成失败：' + result.error)
    }
  } catch (error) {
    console.error('[QuickGroup] 生成失败', error)
    toast.error('生成失败：' + error.message)
  } finally {
    generating.value = false
  }
}

// 确认创建
async function handleConfirm() {
  if (!canCreate.value) return

  creating.value = true
  try {
    const profile = profilesStore.getProfileById(selectedProfileId.value)
    if (!profile) {
      toast.error('请选择 LLM 配置')
      return
    }

    // 1. 创建群组
    const groupData = {
      name: preview.name,
      llmProvider: profile.provider,
      llmModel: profile.model,
      llmApiKey: profile.apiKey,
      llmBaseUrl: profile.baseURL,
      useGlobalApiKey: false,
      maxHistory: 20,
      thinkingEnabled: false,
      randomOrder: false,
      systemPrompt: '你是一个"多角色对话模拟器"。任务是根据提供的场景和人物设定，生成符合人物性格的对话内容。如果设定是日常对话场景，那么每个角色的回复在符合人设的情况下保持简洁',
      background: preview.background || null
    }

    const group = await groupsStore.createGroup(groupData)

    // 2. 批量创建角色（逐个容错）
    let failedChars = 0
    for (const char of preview.characters) {
      try {
        if (saveToLibrary.value) {
          // 先保存到角色库，再用 importToGroup 导入群组（保持 ID 一致）
          const libChar = await globalCharsStore.createCharacter({
            name: char.name,
            gender: char.gender,
            age: char.age,
            systemPrompt: char.systemPrompt
          })
          await globalCharsStore.importToGroup(libChar.id, group.id)
        } else {
          await charactersStore.createCharacter({
            groupId: group.id,
            name: char.name,
            systemPrompt: char.systemPrompt
          })
        }
      } catch (err) {
        failedChars++
        console.warn('[QuickGroup] 创建角色失败:', char.name, err)
      }
    }

    if (failedChars > 0) {
      toast.warning(`${failedChars} 个角色创建失败，其余已成功`)
    }

    // 4. 选中新群组并刷新角色列表
    groupsStore.selectGroup(group.id)
    await charactersStore.loadCharacters(group.id)

    toast.success(`群组"${preview.name}"创建成功！包含 ${preview.characters.length} 个角色`)
    emit('created', group)
    closeDialog()
  } catch (error) {
    console.error('[QuickGroup] 创建失败', error)
    toast.error('创建失败：' + error.message)
  } finally {
    creating.value = false
  }
}

// ============ 提示词设置方法 ============

async function loadPromptConfig() {
  promptLoading.value = true
  try {
    const result = await window.electronAPI.config.quickGroupConfig.get()
    if (result.success) {
      promptForm.systemPrompt = result.data.systemPrompt
      promptForm.userPromptTemplate = result.data.userPromptTemplate
      promptForm.defaultUserPrompt = result.data.defaultUserPrompt
      savedPrompt.systemPrompt = result.data.systemPrompt
      savedPrompt.userPromptTemplate = result.data.userPromptTemplate
      savedPrompt.defaultUserPrompt = result.data.defaultUserPrompt
    }
  } catch (error) {
    console.error('[QuickGroup] 加载提示词配置失败', error)
  } finally {
    promptLoading.value = false
  }
}

async function handleSavePrompt() {
  promptSaving.value = true
  try {
    const result = await window.electronAPI.config.quickGroupConfig.save({
      systemPrompt: promptForm.systemPrompt,
      userPromptTemplate: promptForm.userPromptTemplate,
      defaultUserPrompt: promptForm.defaultUserPrompt
    })
    if (result.success) {
      savedPrompt.systemPrompt = promptForm.systemPrompt
      savedPrompt.userPromptTemplate = promptForm.userPromptTemplate
      savedPrompt.defaultUserPrompt = promptForm.defaultUserPrompt
      toast.success('提示词配置已保存')
    } else {
      toast.error('保存失败')
    }
  } catch (error) {
    toast.error('保存失败：' + error.message)
  } finally {
    promptSaving.value = false
  }
}

async function handleResetPrompt() {
  try {
    const result = await window.electronAPI.config.quickGroupConfig.reset()
    if (result.success) {
      promptForm.systemPrompt = result.data.systemPrompt
      promptForm.userPromptTemplate = result.data.userPromptTemplate
      promptForm.defaultUserPrompt = result.data.defaultUserPrompt
      savedPrompt.systemPrompt = result.data.systemPrompt
      savedPrompt.userPromptTemplate = result.data.userPromptTemplate
      savedPrompt.defaultUserPrompt = result.data.defaultUserPrompt
      toast.success('已恢复默认配置')
    }
  } catch (error) {
    toast.error('重置失败：' + error.message)
  }
}

function switchToPromptTab() {
  activeTab.value = 'prompt'
  if (!promptForm.systemPrompt) {
    loadPromptConfig()
  }
}

// ============ 初始化 ============

onMounted(async () => {
  await profilesStore.loadProfiles()
  loadPromptConfig()
})
</script>

<style lang="scss" scoped>
@use 'sass:color';

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: $bg-primary;
  border-radius: $border-radius-lg;
  width: 680px;
  max-width: 92vw;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  box-shadow: $shadow-lg;
  overflow: hidden;
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
}

.btn-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 24px;
  color: $text-secondary;
  cursor: pointer;
  border-radius: $border-radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: $bg-secondary;
  }
}

// ============ Tab 头部 ============

.tab-header {
  display: flex;
  border-bottom: 1px solid $border-color;
  padding: 0 $spacing-lg;
}

.tab-btn {
  padding: $spacing-md $spacing-lg;
  border: none;
  background: transparent;
  font-size: $font-size-md;
  color: $text-secondary;
  cursor: pointer;
  position: relative;
  transition: color 0.2s;

  &:hover {
    color: $text-primary;
  }

  &.active {
    color: $wechat-green;
    font-weight: $font-weight-medium;

    &::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: $spacing-md;
      right: $spacing-md;
      height: 2px;
      background: $wechat-green;
      border-radius: 1px;
    }
  }
}

.tab-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

// ============ 对话框主体 ============

.dialog-body {
  padding: $spacing-lg $spacing-xl;
  overflow-y: auto;
  flex: 1;
}

// ============ 步骤 1：输入 ============

.step-input {
  .input-tip {
    padding: $spacing-md 0;
    text-align: center;

    p {
      margin: 0;
      font-size: $font-size-sm;
      color: $text-secondary;
    }
  }
}

// ============ 步骤 2：预览 ============

.preview-section {
  margin-bottom: $spacing-lg;
  padding-bottom: $spacing-lg;
  border-bottom: 1px solid $border-color-light;

  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }
}

.section-title {
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  color: $text-primary;
  margin-bottom: $spacing-md;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $spacing-md;
}

// 角色列表
.character-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.character-card {
  background: $bg-secondary;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  overflow: hidden;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $spacing-sm $spacing-md;
    background: rgba($color-primary, 0.05);
    border-bottom: 1px solid $border-color;
  }

  .card-index {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $color-primary;
  }

  .card-body {
    padding: $spacing-md;
  }

  .card-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: $spacing-sm;
    margin-bottom: $spacing-sm;
  }

  .card-field {
    display: flex;
    flex-direction: column;
  }

  .card-field-name {
    min-width: 0;
  }

  .card-field-full {
    margin-top: $spacing-sm;
  }
}

.field-label {
  font-size: $font-size-xs;
  color: $text-secondary;
  margin-bottom: 4px;
  display: block;
}

.btn-icon-small {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: $border-radius-sm;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.1);
  }

  &.btn-danger:hover {
    background: rgba(255, 59, 48, 0.2);
    color: #ff3b30;
  }
}

// ============ 提示词设置 ============

.prompt-loading {
  text-align: center;
  padding: $spacing-xxl;
  color: $text-secondary;
}

.prompt-settings {
  display: flex;
  flex-direction: column;
}

.prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  padding-top: $spacing-md;
  border-top: 1px solid $border-color-light;
}

// ============ 通用表单样式 ============

.form-group {
  margin-bottom: $spacing-md;
}

.form-label {
  display: block;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  margin-bottom: $spacing-sm;
  color: $text-primary;

  .label-hint {
    font-weight: $font-weight-normal;
    color: $text-placeholder;
    font-size: $font-size-xs;
  }
}

.input {
  width: 100%;
  padding: $spacing-md;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  font-size: $font-size-md;
  transition: border-color 0.2s;
  box-sizing: border-box;
  background: $bg-primary;
  color: $text-primary;

  &:focus {
    outline: none;
    border-color: $wechat-green;
  }

  &::placeholder {
    color: $text-placeholder;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.input-sm {
  padding: $spacing-sm $spacing-md;
  font-size: $font-size-sm;
}

.textarea {
  resize: none;
  min-height: 80px;
  font-family: inherit;
  line-height: 1.6;
}

.textarea-sm {
  min-height: 60px;
}

.textarea-code {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: $font-size-sm;
  line-height: 1.5;
  min-height: 240px;
  height: auto;
}

.form-hint {
  font-size: $font-size-xs;
  color: $text-placeholder;
  text-align: right;
  margin-top: $spacing-xs;
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
    font-size: $font-size-sm;
    color: $text-primary;
  }
}

// ============ 底部按钮 ============

.dialog-footer {
  padding: $spacing-lg $spacing-xl;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  flex-shrink: 0;
}

.btn {
  padding: $spacing-sm $spacing-lg;
  border: none;
  border-radius: $border-radius-md;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  cursor: pointer;
  transition: all 0.2s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-secondary {
  background: $bg-tertiary;
  color: $text-primary;

  &:hover:not(:disabled) {
    background: color.adjust($bg-tertiary, $lightness: -5%);
  }
}

.btn-primary {
  background: $wechat-green;
  color: white;

  &:hover:not(:disabled) {
    background: color.adjust($wechat-green, $lightness: -5%);
  }
}

.btn-text {
  background: transparent;
  color: $text-secondary;

  &:hover:not(:disabled) {
    color: $text-primary;
    background: $bg-secondary;
  }
}

.btn-ai {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: $spacing-sm $spacing-xl;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }
}
</style>
