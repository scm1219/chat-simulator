<template>
  <div class="dialog-overlay" @click="handleOverlayClick">
    <div class="dialog dialog-lg" @click.stop>
      <div class="dialog-header">
        <h3>LLM 配置管理</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="dialog-body">
        <!-- 空状态 -->
        <div v-if="!loading && profiles.length === 0" class="empty-state">
          <p>还没有配置 LLM</p>
          <p class="hint">点击下方"添加配置"按钮开始使用</p>
        </div>

        <!-- 配置列表 -->
        <div v-else class="profile-list">
          <div
            v-for="profile in profiles"
            :key="profile.id"
            class="profile-item"
            :class="{ testing: testingId === profile.id }"
          >
            <div class="profile-info">
              <div class="profile-name">{{ profile.name }}</div>
              <div class="profile-details">
                <span class="profile-provider">{{ getProviderName(profile.provider) }}</span>
                <span class="separator">·</span>
                <span class="profile-model">{{ profile.model }}</span>
              </div>
            </div>

            <div class="profile-actions">
              <button
                class="btn-icon"
                @click="handleTest(profile)"
                :disabled="testingId === profile.id"
                title="测试连接"
              >
                {{ testingId === profile.id ? '测试中...' : '🔗' }}
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
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="loading-state">
          <p>加载中...</p>
        </div>
      </div>

      <div class="dialog-footer">
        <button class="btn btn-secondary" @click="$emit('close')">
          关闭
        </button>
        <button class="btn btn-primary" @click="handleAdd">
          + 添加配置
        </button>
      </div>

      <!-- 编辑/添加表单对话框 -->
      <div v-if="showFormDialog" class="dialog-overlay dialog-overlay-nested" @click="closeFormDialog">
        <div class="dialog" @click.stop>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useToastStore } from '../../stores/toast'
import { useDialog } from '../../composables/useDialog'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'
import LLMProfileForm from './LLMProfileForm.vue'

const emit = defineEmits(['close'])

const store = useLLMProfilesStore()
const toast = useToastStore()
const { confirm } = useDialog()

const profiles = computed(() => store.profiles)
const loading = computed(() => store.loading)

const showFormDialog = ref(false)
const editingProfile = ref(null)
const formData = ref({})
const testingId = ref(null)

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
function handleAdd() {
  editingProfile.value = null
  formData.value = {
    name: '',
    provider: 'openai',
    apiKey: '',
    baseURL: '',
    model: ''
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
    model: profile.model
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
  if (result.success) {
    toast.success('删除成功')
  } else {
    toast.error('删除失败: ' + result.error)
  }
}

// 测试连接
async function handleTest(profile) {
  testingId.value = profile.id

  try {
    const result = await window.electronAPI.llm.testConnection({
      provider: profile.provider,
      apiKey: profile.apiKey,
      baseURL: profile.baseURL,
      model: profile.model
    })

    if (result.success) {
      toast.success(`连接成功！模型：${result.model}`, 5000)
    } else {
      toast.error('连接失败: ' + result.error)
    }
  } catch (error) {
    toast.error('连接失败: ' + error.message)
  } finally {
    testingId.value = null
  }
}

// 提交表单
async function handleFormSubmit(data) {
  let result

  if (editingProfile.value) {
    result = await store.updateProfile(editingProfile.value.id, data)
  } else {
    result = await store.addProfile(data)
  }

  if (result.success) {
    toast.success(editingProfile.value ? '保存成功' : '添加成功')
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

// 点击遮罩层关闭
function handleOverlayClick() {
  emit('close')
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

.dialog-overlay-nested {
  // 嵌套的弹窗需要更高的 z-index
  z-index: 1001;
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

.dialog-footer {
  padding: $spacing-lg $spacing-xl;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
}

.dialog-lg {
  max-width: 800px;
  width: 90%;
}

.empty-state {
  text-align: center;
  padding: $spacing-xxl 0;
  color: $text-secondary;

  .hint {
    margin-top: $spacing-sm;
    font-size: $font-size-sm;
  }
}

.loading-state {
  text-align: center;
  padding: $spacing-xxl 0;
  color: $text-secondary;
}

.profile-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.profile-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $spacing-lg;
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
}

.profile-name {
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  color: $text-primary;
  margin-bottom: $spacing-xs;
}

.profile-details {
  font-size: $font-size-sm;
  color: $text-secondary;

  .separator {
    margin: 0 $spacing-xs;
  }
}

.profile-actions {
  display: flex;
  gap: $spacing-sm;
}

.btn-icon {
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: $border-radius-sm;
  cursor: pointer;
  font-size: 18px;
  transition: background 0.2s;

  &:hover:not(:disabled) {
    background: $bg-tertiary;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.btn-danger:hover:not(:disabled) {
    background: rgba($color-danger, 0.1);
  }
}
</style>
