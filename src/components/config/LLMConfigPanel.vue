<template>
  <div class="llm-config-panel">
    <div class="panel-header">
      <h3>LLM 配置管理</h3>
      <button class="btn btn-primary btn-sm" @click="handleAddProfile">
        + 添加配置
      </button>
    </div>

    <div class="panel-content">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <p>加载中...</p>
      </div>

      <!-- 空状态 -->
      <div v-else-if="profiles.length === 0" class="empty-state">
        <p>还没有配置 LLM</p>
        <p class="hint">点击右上角"添加配置"开始使用</p>
      </div>

      <!-- 按供应商分组显示配置 -->
      <div v-else class="profile-groups">
        <div
          v-for="provider in providerGroups"
          :key="provider.id"
          class="provider-group"
        >
          <div class="provider-header">
            <h4>{{ provider.name }}</h4>
            <button
              class="btn-icon"
              @click="handleAddModelToProvider(provider.id)"
              title="添加模型"
            >
              +
            </button>
          </div>

          <div class="profile-list">
            <div
              v-for="profile in provider.profiles"
              :key="profile.id"
              class="profile-item"
            >
              <div class="profile-info">
                <div class="profile-name">{{ profile.name }}</div>
                <div class="profile-model">{{ profile.model }}</div>
              </div>

              <div class="profile-actions">
                <label class="thinking-toggle" title="思考模式">
                  <input
                    type="checkbox"
                    :checked="profile.thinking_enabled === 1"
                    @change="toggleThinkingMode(profile)"
                  />
                  <span class="toggle-text">思考</span>
                </label>

                <button
                  class="btn-icon"
                  @click="handleEdit(profile)"
                  title="编辑"
                >
                  ✏️
                </button>

                <button
                  class="btn-icon btn-danger"
                  @click="handleDelete(profile)"
                  title="删除"
                >
                  🗑️
                </button>
              </div>
            </div>

            <div v-if="provider.profiles.length === 0" class="empty-models">
              <p>还没有配置模型</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑/添加表单对话框 -->
    <div v-if="showFormDialog" class="dialog-overlay" @click.self="closeFormDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h3>{{ editingProfile ? '编辑配置' : '添加配置' }}</h3>
          <button class="close-btn" @click="closeFormDialog">×</button>
        </div>

        <div class="dialog-body">
          <LLMProfileForm
            v-model="formData"
            :editing="!!editingProfile"
            @submit="handleFormSubmit"
            @cancel="closeFormDialog"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useToastStore } from '../../stores/toast'
import { useDialog } from '../../composables/useDialog'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'
import LLMProfileForm from './LLMProfileForm.vue'

const store = useLLMProfilesStore()
const toast = useToastStore()
const { confirm } = useDialog()

const profiles = computed(() => store.profiles)
const loading = computed(() => store.loading)

// 按供应商分组
const providerGroups = computed(() => {
  const groups = {}

  // 初始化所有供应商组
  Object.values(LLM_PROVIDERS).forEach(provider => {
    groups[provider.id] = {
      id: provider.id,
      name: provider.name,
      profiles: []
    }
  })

  // 分配配置到对应供应商
  profiles.value.forEach(profile => {
    if (groups[profile.provider]) {
      groups[profile.provider].profiles.push(profile)
    }
  })

  // 过滤掉没有配置的供应商，按名称排序；供应商内的配置按名称字典排序
  return Object.values(groups)
    .filter(group => group.profiles.length > 0)
    .map(group => ({
      ...group,
      profiles: [...group.profiles].sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const showFormDialog = ref(false)
const editingProfile = ref(null)
const formData = ref({})

// 加载配置列表
onMounted(async () => {
  await loadProfiles()
})

async function loadProfiles() {
  await store.loadProfiles()
}

// 获取供应商名称
function getProviderName(providerId) {
  const provider = LLM_PROVIDERS[providerId]
  return provider ? provider.name : providerId
}

// 添加配置
function handleAddProfile() {
  editingProfile.value = null
  formData.value = {
    name: '',
    provider: 'openai',
    apiKey: '',
    baseURL: '',
    model: '',
    thinkingEnabled: false
  }
  showFormDialog.value = true
}

// 为指定供应商添加模型
function handleAddModelToProvider(providerId) {
  editingProfile.value = null
  const providerConfig = LLM_PROVIDERS[providerId]

  formData.value = {
    name: `${providerConfig.name} 配置`,
    provider: providerId,
    apiKey: '',
    baseURL: providerConfig.baseURL || '',
    model: providerConfig.models?.[0] || '',
    streamEnabled: true,
    thinkingEnabled: false,
    useNativeApi: false,
    proxy: { type: 'none', customUrl: '', bypassRules: 'localhost,127.0.0.1,::1' }
  }
  showFormDialog.value = true
}

// 编辑配置
function handleEdit(profile) {
  editingProfile.value = profile
  formData.value = {
    name: profile.name,
    provider: profile.provider,
    apiKey: profile.apiKey,
    baseURL: profile.baseURL,
    model: profile.model,
    streamEnabled: profile.streamEnabled !== undefined ? profile.streamEnabled : true,
    thinkingEnabled: profile.thinking_enabled === 1,
    useNativeApi: profile.useNativeApi === true,
    proxy: profile.proxy || { type: 'none', customUrl: '', bypassRules: 'localhost,127.0.0.1,::1' }
  }
  showFormDialog.value = true
}

// 删除配置
async function handleDelete(profile) {
  const confirmed = await confirm({
    title: '删除配置',
    message: `确定要删除配置"${profile.name}"吗？`,
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  const result = await store.deleteProfile(profile.id)
  if (!result.success) {
    toast.error('删除失败: ' + result.error)
  }
}

// 切换思考模式
async function toggleThinkingMode(profile) {
  const newThinkingEnabled = profile.thinking_enabled === 0 ? 1 : 0

  const result = await store.updateProfile(profile.id, {
    thinking_enabled: newThinkingEnabled
  })

  if (!result.success) {
    toast.error('切换思考模式失败: ' + result.error)
  }
}

// 提交表单
async function handleFormSubmit(data) {
  // 深拷贝以剥离 Vue 响应式代理（IPC 结构化克隆要求纯对象）
  const rawData = JSON.parse(JSON.stringify(data))
  // 转换数据格式
  const submitData = {
    ...rawData,
    thinking_enabled: rawData.thinkingEnabled ? 1 : 0
  }
  delete submitData.thinkingEnabled

  let result

  if (editingProfile.value) {
    result = await store.updateProfile(editingProfile.value.id, submitData)
  } else {
    result = await store.addProfile(submitData)
  }

  if (result.success) {
    closeFormDialog()
  } else {
    toast.error((editingProfile.value ? '保存失败: ' : '添加失败: ') + result.error)
  }
}

// 关闭表单对话框
function closeFormDialog() {
  showFormDialog.value = false
  editingProfile.value = null
  formData.value = {}
}
</script>

<style lang="scss" scoped>
@use "sass:color";

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

.loading-state,
.empty-state {
  padding: $spacing-xxl;
  text-align: center;
  color: $text-secondary;

  .hint {
    margin-top: $spacing-sm;
    font-size: $font-size-sm;
  }
}

.profile-groups {
  padding: $spacing-lg;
}

.provider-group {
  margin-bottom: $spacing-xl;
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $spacing-md;

  h4 {
    font-size: $font-size-md;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }
}

.profile-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.profile-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $spacing-md;
  background: $bg-secondary;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  transition: all 0.2s;

  &:hover {
    border-color: $color-primary;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
}

.profile-info {
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-primary;
  margin-bottom: 2px;
}

.profile-model {
  font-size: $font-size-xs;
  color: $text-secondary;
}

.profile-actions {
  display: flex;
  gap: $spacing-sm;
  align-items: center;
}

.thinking-toggle {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  padding: $spacing-xs $spacing-sm;
  background: $bg-tertiary;
  border-radius: $border-radius-sm;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;

  &:hover {
    background: color.adjust($bg-tertiary, $lightness: -5%);
  }

  input[type="checkbox"] {
    cursor: pointer;
  }

  .toggle-text {
    font-size: $font-size-xs;
    color: $text-secondary;
  }
}

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: $border-radius-sm;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.2s;

  &:hover {
    background: $bg-secondary;
  }

  &.btn-danger:hover {
    background: rgba($color-danger, 0.1);
  }
}

.empty-models {
  padding: $spacing-lg;
  text-align: center;
  color: $text-secondary;
  font-size: $font-size-sm;
}

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
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow: auto;
}

.dialog-header {
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

.close-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: $border-radius-sm;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;

  &:hover {
    background: $bg-secondary;
  }
}

.dialog-body {
  padding: $spacing-lg;
}
</style>
