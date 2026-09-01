<template>
  <div class="profile-manager">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <p>加载中...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="profiles.length === 0" class="empty-state">
      <p>还没有配置 LLM</p>
      <p class="hint">点击"添加配置"开始使用</p>
    </div>

    <!-- 按供应商分组显示配置 -->
    <div v-else class="profile-groups">
      <div
        v-for="provider in providerGroups"
        :key="provider.providerId"
        class="provider-group"
      >
        <div class="provider-header">
          <h4>{{ provider.providerName }}</h4>
          <button
            class="btn-icon"
            @click="handleAddModelToProvider(provider.providerId)"
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
            :class="{ testing: testingId === profile.id }"
          >
            <div class="profile-info">
              <div class="profile-name">{{ profile.name }}</div>
              <div class="profile-model">{{ profile.model }}</div>
            </div>

            <div class="profile-actions">
              <label class="thinking-toggle" title="思考模式">
                <input
                  type="checkbox"
                  :checked="profile.thinkingEnabled === true"
                  @change="toggleThinkingMode(profile)"
                />
                <span class="toggle-text">思考</span>
              </label>

              <button
                class="btn-icon"
                @click="handleTest(profile)"
                :disabled="testingId === profile.id"
                title="测试连接"
              >
                {{ testingId === profile.id ? '⏳' : '🔗' }}
              </button>

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

    <!-- 编辑/添加表单对话框（嵌套层，遮罩不关闭防误触丢 Key） -->
    <div v-if="showFormDialog" class="dialog-overlay-nested">
      <BaseDialog
        :title="editingProfile ? '编辑配置' : '添加配置'"
        max-width="500px"
        :close-on-overlay="false"
        @close="closeFormDialog"
      >
        <LLMProfileForm
          v-model="formData"
          :editing="!!editingProfile"
          :submitting="formSubmitting"
          @submit="handleFormSubmit"
          @cancel="closeFormDialog"
        />
      </BaseDialog>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useToastStore } from '../../stores/toast'
import { useDialog } from '../../composables/useDialog'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'
import { groupProfilesByProvider } from '../../utils/llm-providers.js'
import BaseDialog from '../common/BaseDialog.vue'

// 表单组件按需异步加载，减小首屏 bundle 体积
const LLMProfileForm = defineAsyncComponent(() => import('./LLMProfileForm.vue'))

const store = useLLMProfilesStore()
const toast = useToastStore()
const { confirm } = useDialog()

const profiles = computed(() => store.profiles)
const loading = computed(() => store.loading)

const providerGroups = computed(() => groupProfilesByProvider(profiles.value))

const showFormDialog = ref(false)
const editingProfile = ref(null)
const formData = ref({})
const formSubmitting = ref(false)
const testingId = ref(null)

onMounted(() => store.loadProfiles())

// 添加配置（面板头部按钮与对话框底部按钮统一走这里）
function openAdd() {
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

  // 优先复用同供应商已有配置的凭据，避免跨供应商泄漏 A 家 Key 到 B 家表单
  const sameProviderProfile = profiles.value?.find(p => p.provider === providerId)
  const defaultApiKey = sameProviderProfile?.apiKey || ''
  // Ollama 默认走原生 API，使用 nativeBaseURL（不带 /v1）
  const useNative = providerId === 'ollama' && providerConfig.defaultNativeApi !== false
  const defaultBaseURL = sameProviderProfile?.baseURL ||
    (useNative ? providerConfig.nativeBaseURL : providerConfig.baseURL) || ''

  formData.value = {
    name: `${providerConfig.name} 配置`,
    provider: providerId,
    apiKey: defaultApiKey,
    baseURL: defaultBaseURL,
    model: providerConfig.models?.[0] || '',
    streamEnabled: true,
    thinkingEnabled: false,
    // Ollama 默认使用原生 API（性能远优于 OpenAI 兼容端点）
    useNativeApi: useNative,
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
    thinkingEnabled: profile.thinkingEnabled === true,
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

// 测试连接（自 LLMProfileDialog 移植，spec §5.1）
async function handleTest(profile) {
  testingId.value = profile.id
  try {
    const result = await window.electronAPI.llm.testConnection({
      provider: profile.provider,
      apiKey: profile.apiKey,
      baseURL: profile.baseURL,
      model: profile.model,
      streamEnabled: profile.streamEnabled !== undefined ? profile.streamEnabled : true,
      useNativeApi: profile.useNativeApi === true,
      proxy: profile.proxy || { type: 'none', customUrl: '', bypassRules: 'localhost,127.0.0.1,::1' }
    })
    if (result.success) toast.success(`连接成功！模型：${result.model}`, 5000)
    else toast.error('连接失败: ' + result.error)
  } catch (error) {
    toast.error('连接失败: ' + error.message)
  } finally {
    testingId.value = null
  }
}

// 切换思考模式
async function toggleThinkingMode(profile) {
  const newThinkingEnabled = !(profile.thinkingEnabled === true)

  const result = await store.updateProfile(profile.id, {
    thinkingEnabled: newThinkingEnabled
  })

  if (!result.success) {
    toast.error('切换思考模式失败: ' + result.error)
  }
}

// 提交表单
async function handleFormSubmit(data) {
  if (formSubmitting.value) return
  formSubmitting.value = true

  try {
    // 深拷贝以剥离 Vue 响应式代理（IPC 结构化克隆要求纯对象）
    const submitData = JSON.parse(JSON.stringify(data))

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
  } finally {
    formSubmitting.value = false
  }
}

// 关闭表单对话框
function closeFormDialog() {
  showFormDialog.value = false
  editingProfile.value = null
  formData.value = {}
}

defineExpose({ openAdd })
</script>

<style lang="scss" scoped>
@use "sass:color";

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

  &.testing {
    opacity: 0.6;
    pointer-events: none;
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

  &:hover:not(:disabled) {
    background: $bg-secondary;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.btn-danger:hover:not(:disabled) {
    background: rgba($color-danger, 0.1);
  }
}

.empty-models {
  padding: $spacing-lg;
  text-align: center;
  color: $text-secondary;
  font-size: $font-size-sm;
}

.dialog-overlay-nested {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001; // 高于 BaseDialog 的 $z-index-dialog(1000)
}
</style>
