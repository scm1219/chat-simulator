<template>
  <BaseDialog title="LLM 配置管理" max-width="800px" @close="$emit('close')">
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
          <button class="btn-icon" @click="handleTest(profile)" :disabled="testingId === profile.id" title="测试连接">
            {{ testingId === profile.id ? '测试中...' : '🔗' }}
          </button>
          <button class="btn-icon" @click="handleEdit(profile)" title="编辑">✏️</button>
          <button class="btn-icon btn-danger" @click="handleDelete(profile)" title="删除">🗑️</button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading-state"><p>加载中...</p></div>

    <template #footer>
      <button class="btn btn-secondary" @click="$emit('close')">关闭</button>
      <button class="btn btn-primary" @click="handleAdd">+ 添加配置</button>
    </template>

    <!-- 嵌套编辑对话框 -->
    <div v-if="showFormDialog" class="dialog-overlay-nested" @click="closeFormDialog">
      <BaseDialog
        :title="editingProfile ? '编辑配置' : '添加配置'"
        max-width="500px"
        :close-on-overlay="false"
        @close="closeFormDialog"
      >
        <LLMProfileForm
          v-model="formData"
          :editing="!!editingProfile"
          @submit="handleFormSubmit"
          @cancel="closeFormDialog"
        />
      </BaseDialog>
    </div>
  </BaseDialog>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useToastStore } from '../../stores/toast'
import { useDialog } from '../../composables/useDialog'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'
import BaseDialog from '../common/BaseDialog.vue'
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

onMounted(() => store.loadProfiles())

function getProviderName(providerId) {
  const provider = LLM_PROVIDERS[providerId]
  return provider ? provider.name : providerId
}

async function handleAdd() {
  editingProfile.value = null
  formData.value = {
    name: '', provider: 'openai', apiKey: '', baseURL: '', model: '',
    streamEnabled: true, thinkingEnabled: false, useNativeApi: false,
    proxy: { type: 'none', customUrl: '', bypassRules: 'localhost,127.0.0.1,::1' }
  }
  await nextTick()
  showFormDialog.value = true
}

async function handleEdit(profile) {
  editingProfile.value = profile
  formData.value = {
    name: profile.name,
    provider: profile.provider,
    apiKey: profile.apiKey,
    baseURL: profile.baseURL,
    model: profile.model,
    streamEnabled: profile.streamEnabled !== undefined ? profile.streamEnabled : true,
    thinkingEnabled: profile.thinkingEnabled || false,
    useNativeApi: profile.useNativeApi === true || profile.useNativeApi === 1 || profile.useNativeApi === 'true',
    proxy: {
      type: profile.proxy?.type || 'none',
      customUrl: profile.proxy?.customUrl || '',
      bypassRules: profile.proxy?.bypassRules || 'localhost,127.0.0.1,::1'
    }
  }
  await nextTick()
  showFormDialog.value = true
}

async function handleDelete(profile) {
  const confirmed = await confirm({
    title: '删除配置',
    message: `确定要删除配置"${profile.name}"吗？`,
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return
  const result = await store.deleteProfile(profile.id)
  if (!result.success) toast.error('删除失败: ' + result.error)
}

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

async function handleFormSubmit(data) {
  const result = editingProfile.value
    ? await store.updateProfile(editingProfile.value.id, data)
    : await store.addProfile(data)
  if (result.success) closeFormDialog()
  else toast.error((editingProfile.value ? '保存失败: ' : '添加失败: ') + result.error)
}

function closeFormDialog() {
  showFormDialog.value = false
  editingProfile.value = null
  formData.value = {}
}
</script>

<style lang="scss" scoped>
.dialog-overlay-nested {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1001;
}

.empty-state {
  text-align: center;
  padding: $spacing-xxl 0;
  color: $text-secondary;
  .hint { margin-top: $spacing-sm; font-size: $font-size-sm; }
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

  &:hover { border-color: $color-primary; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); }
  &.testing { opacity: 0.6; pointer-events: none; }
}

.profile-info { flex: 1; }
.profile-name { font-size: $font-size-md; font-weight: $font-weight-medium; color: $text-primary; margin-bottom: $spacing-xs; }
.profile-details {
  font-size: $font-size-sm;
  color: $text-secondary;
  .separator { margin: 0 $spacing-xs; }
}

.profile-actions { display: flex; gap: $spacing-sm; }

.btn-icon {
  width: 36px; height: 36px; padding: 0; border: none;
  background: transparent; border-radius: $border-radius-sm;
  cursor: pointer; font-size: 18px; transition: background 0.2s;

  &:hover:not(:disabled) { background: $bg-tertiary; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &.btn-danger:hover:not(:disabled) { background: rgba($color-danger, 0.1); }
}
</style>
