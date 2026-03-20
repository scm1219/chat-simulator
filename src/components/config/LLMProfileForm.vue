<template>
  <div class="llm-profile-form">
    <div class="form-group">
      <label>配置名称</label>
      <input
        v-model="form.name"
        type="text"
        class="input"
        placeholder="留空则使用模型名称"
        :disabled="submitting"
      />
    </div>

    <div class="form-group">
      <label>供应商 <span class="required">*</span></label>
      <select
        v-model="form.provider"
        class="input"
        :disabled="submitting"
        @change="handleProviderChange"
      >
        <option
          v-for="provider in providers"
          :key="provider.id"
          :value="provider.id"
        >
          {{ provider.name }}
        </option>
      </select>
    </div>

    <div class="form-group">
      <label>API Key <span class="required">*</span></label>
      <input
        v-model="form.apiKey"
        type="password"
        class="input"
        placeholder="sk-..."
        :disabled="submitting || !currentProvider?.needApiKey"
      />
      <small v-if="!currentProvider?.needApiKey" class="hint">
        该供应商不需要 API Key
      </small>
    </div>

    <div class="form-group">
      <label>API 地址</label>
      <div class="base-url-input">
        <input
          v-model="form.baseURL"
          type="text"
          class="input"
          placeholder="https://api.example.com/v1"
          :disabled="submitting"
        />
        <button
          type="button"
          class="btn-reset"
          @click="resetBaseURL"
          :disabled="submitting || !defaultBaseURL"
          title="重置为默认地址"
        >
          重置
        </button>
      </div>
      <small class="hint">
        默认: {{ defaultBaseURL || '无' }}
        <span v-if="isBaseURLModified" class="modified-badge">已修改</span>
      </small>
    </div>

    <div class="form-group">
      <label>模型 <span class="required">*</span></label>
      <div v-if="currentProvider?.models?.length > 0" class="model-select">
        <select
          v-model="form.model"
          class="input"
          :disabled="submitting"
        >
          <option
            v-for="model in currentProvider.models"
            :key="model"
            :value="model"
          >
            {{ model }}
          </option>
        </select>
        <button
          type="button"
          class="btn-custom-model"
          @click="showCustomModel = !showCustomModel"
          :disabled="submitting"
        >
          {{ showCustomModel ? '选择预设' : '自定义' }}
        </button>
      </div>
      <input
        v-else
        v-model="form.model"
        type="text"
        class="input"
        placeholder="例如：gpt-3.5-turbo"
        :disabled="submitting"
      />
    </div>

    <div v-if="showCustomModel" class="form-group">
      <label>自定义模型</label>
      <input
        v-model="form.model"
        type="text"
        class="input"
        placeholder="输入模型名称"
        :disabled="submitting"
      />
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input
          v-model="form.thinkingEnabled"
          type="checkbox"
          :disabled="submitting"
        />
        <span>启用思考模式</span>
      </label>
      <small class="hint">
        启用后，模型会在回复前展示思考过程（适用于支持思考模式的模型，如 o1 系列）
      </small>
    </div>

    <div class="form-actions">
      <button
        type="button"
        class="btn btn-secondary"
        @click="$emit('cancel')"
        :disabled="submitting"
      >
        取消
      </button>
      <button
        type="button"
        class="btn btn-primary"
        @click="handleSubmit"
        :disabled="submitting || !canSubmit"
      >
        {{ submitting ? '保存中...' : editing ? '保存' : '添加' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { LLM_PROVIDERS, getProviderConfig, getProviderDefaultBaseURL } from '../../../electron/llm/providers/index.js'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      name: '',
      provider: 'openai',
      apiKey: '',
      baseURL: '',
      model: '',
      thinkingEnabled: false
    })
  },
  editing: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'submit', 'cancel'])

const form = ref({ ...props.modelValue })
const submitting = ref(false)
const showCustomModel = ref(false)

// 用于防止递归更新的标志位
let isUpdatingFromProps = false

// 供应商列表
const providers = Object.values(LLM_PROVIDERS)

// 当前供应商配置
const currentProvider = computed(() => {
  return getProviderConfig(form.value.provider)
})

// 当前供应商默认 baseURL
const defaultBaseURL = computed(() => {
  return getProviderDefaultBaseURL(form.value.provider)
})

// baseURL 是否已被修改
const isBaseURLModified = computed(() => {
  return form.value.baseURL && form.value.baseURL !== defaultBaseURL.value
})

// 表单验证
const canSubmit = computed(() => {
  const needApiKey = currentProvider.value?.needApiKey

  return (
    form.value.provider !== '' &&
    (!needApiKey || form.value.apiKey.trim() !== '') &&
    form.value.model.trim() !== ''
  )
})

// 监听 modelValue 变化（从父组件更新）
watch(() => props.modelValue, (newVal) => {
  isUpdatingFromProps = true
  form.value = { ...newVal }
  // 下一个 tick 后重置标志位
  setTimeout(() => {
    isUpdatingFromProps = false
  }, 0)
}, { deep: true })

// 监听 form 变化，同步到父组件（用户输入）
watch(form, (newVal) => {
  // 如果是从 props 更新的，不触发 emit
  if (!isUpdatingFromProps) {
    emit('update:modelValue', { ...newVal })
  }
}, { deep: true })

// 供应商变化处理
function handleProviderChange() {
  const providerConfig = getProviderConfig(form.value.provider)

  // 自动填充默认 baseURL
  form.value.baseURL = getProviderDefaultBaseURL(form.value.provider)

  // 自动选择第一个模型
  if (providerConfig?.models?.length > 0) {
    form.value.model = providerConfig.models[0]
    showCustomModel.value = false
  }
}

// 重置 baseURL 为默认值
function resetBaseURL() {
  form.value.baseURL = defaultBaseURL.value
}

// 初始化
onMounted(() => {
  if (form.value.provider) {
    // 如果没有 baseURL，填充默认值
    if (!form.value.baseURL) {
      form.value.baseURL = getProviderDefaultBaseURL(form.value.provider)
    }
    // 如果没有模型，选择第一个
    if (!form.value.model && currentProvider.value?.models?.length > 0) {
      form.value.model = currentProvider.value.models[0]
    }
  }
})

// 提交表单
async function handleSubmit() {
  if (!canSubmit.value || submitting.value) return

  submitting.value = true
  try {
    const submitData = { ...form.value }
    // 如果配置名称为空，使用模型名称
    if (!submitData.name.trim() && submitData.model.trim()) {
      submitData.name = submitData.model
    }
    emit('submit', submitData)
  } finally {
    submitting.value = false
  }
}
</script>

<style lang="scss" scoped>
.llm-profile-form {
  .required {
    color: $color-danger;
  }

  .hint {
    display: block;
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    color: $text-secondary;
  }

  .base-url-input {
    display: flex;
    gap: $spacing-sm;

    .input {
      flex: 1;
    }

    .btn-reset {
      padding: 0 $spacing-md;
      font-size: $font-size-sm;
      background: $bg-secondary;
      border: 1px solid $border-color;
      border-radius: $border-radius-sm;
      cursor: pointer;
      white-space: nowrap;
      color: $text-secondary;

      &:hover:not(:disabled) {
        background: $bg-tertiary;
        color: $text-primary;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }

  .modified-badge {
    display: inline-block;
    margin-left: $spacing-xs;
    padding: 2px 6px;
    font-size: 10px;
    background: $wechat-green;
    color: white;
    border-radius: 4px;
    vertical-align: middle;
  }

  .model-select {
    display: flex;
    gap: $spacing-sm;

    .input {
      flex: 1;
    }

    .btn-custom-model {
      padding: 0 $spacing-md;
      font-size: $font-size-sm;
      background: $bg-secondary;
      border: 1px solid $border-color;
      border-radius: $border-radius-sm;
      cursor: pointer;
      white-space: nowrap;

      &:hover:not(:disabled) {
        background: $bg-tertiary;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: $spacing-md;
    margin-top: $spacing-xl;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    cursor: pointer;
    user-select: none;

    input[type="checkbox"] {
      cursor: pointer;
    }

    span {
      font-size: $font-size-md;
      color: $text-primary;
    }
  }
}
</style>
