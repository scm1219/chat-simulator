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
      <div class="api-key-input">
        <input
          v-model="form.apiKey"
          :type="showApiKey ? 'text' : 'password'"
          class="input"
          placeholder="sk-..."
          :disabled="submitting || !currentProvider?.needApiKey"
        />
        <button
          type="button"
          class="btn-toggle-visibility"
          @click="showApiKey = !showApiKey"
          :disabled="submitting || !currentProvider?.needApiKey"
          :title="showApiKey ? '隐藏' : '显示'"
        >
          {{ showApiKey ? '隐藏' : '显示' }}
        </button>
      </div>
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

    <!-- Ollama 原生 API 模式选择 -->
    <div v-if="form.provider === 'ollama'" class="form-group">
      <label>API 模式</label>
      <div class="api-mode-select">
        <label class="radio-label">
          <input
            v-model="form.useNativeApi"
            type="radio"
            :value="false"
            :disabled="submitting"
          />
          <span>OpenAI 兼容模式</span>
        </label>
        <label class="radio-label">
          <input
            v-model="form.useNativeApi"
            type="radio"
            :value="true"
            :disabled="submitting"
          />
          <span>原生 Ollama API</span>
        </label>
      </div>
      <small class="hint">
        <template v-if="!form.useNativeApi">
          OpenAI 兼容模式：使用 /v1/chat/completions 端点，兼容更多工具
        </template>
        <template v-else>
          原生 API：使用 /api/chat 端点，支持原生 think 参数和流式输出
        </template>
      </small>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input
          v-model="form.streamEnabled"
          type="checkbox"
          :disabled="submitting"
        />
        <span>启用流式输出</span>
      </label>
      <small class="hint">
        启用后，AI 回复会逐字显示，提升响应体验（推荐开启）
      </small>
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

    <!-- 代理配置 -->
    <div class="form-group">
      <label>代理设置</label>
      <div class="proxy-type-select">
        <label class="radio-label">
          <input
            v-model="proxyType"
            type="radio"
            value="none"
            :disabled="submitting"
          />
          <span>不使用代理</span>
        </label>
        <label class="radio-label">
          <input
            v-model="proxyType"
            type="radio"
            value="system"
            :disabled="submitting"
          />
          <span>系统代理</span>
        </label>
        <label class="radio-label">
          <input
            v-model="proxyType"
            type="radio"
            value="custom"
            :disabled="submitting"
          />
          <span>自定义代理</span>
        </label>
      </div>
      <small class="hint">
        <template v-if="proxyType === 'none'">
          不使用任何代理，直接连接 API 服务器
        </template>
        <template v-else-if="proxyType === 'system'">
          使用操作系统或环境变量中配置的代理（HTTP_PROXY / HTTPS_PROXY）
        </template>
        <template v-else>
          使用自定义代理地址连接 API 服务器
        </template>
      </small>
    </div>

    <!-- 自定义代理配置 -->
    <template v-if="proxyType === 'custom'">
      <div class="form-group">
        <label>代理地址 <span class="required">*</span></label>
        <input
          v-model="customProxyUrl"
          type="text"
          class="input"
          placeholder="http://127.0.0.1:58591"
          :disabled="submitting"
        />
        <small class="hint">
          支持 HTTP、HTTPS 和 SOCKS5 代理（如 socks5://127.0.0.1:1080）
        </small>
      </div>
      <div class="form-group">
        <label>代理绕过规则</label>
        <input
          v-model="bypassRules"
          type="text"
          class="input"
          placeholder="localhost,127.0.0.1,::1"
          :disabled="submitting"
        />
        <small class="hint">
          匹配规则的地址将不使用代理，多个规则用逗号分隔（默认：localhost,127.0.0.1,::1）
        </small>
      </div>
    </template>

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
      streamEnabled: true,    // 默认启用流式输出
      thinkingEnabled: false,
      useNativeApi: false     // 默认使用 OpenAI 兼容模式
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
const showApiKey = ref(false)

// 代理配置的响应式数据
const proxyType = ref(props.modelValue?.proxy?.type || 'none')
const customProxyUrl = ref(props.modelValue?.proxy?.customUrl || '')
const bypassRules = ref(props.modelValue?.proxy?.bypassRules || 'localhost,127.0.0.1,::1')

// 默认代理配置常量
const DEFAULT_PROXY = {
  type: 'none',
  customUrl: '',
  bypassRules: 'localhost,127.0.0.1,::1'
}

// 同步代理配置到 form.proxy
function syncProxyToForm() {
  form.value.proxy = {
    type: proxyType.value,
    customUrl: customProxyUrl.value,
    bypassRules: bypassRules.value
  }
}

// 监听代理配置变化，同步到 form
watch([proxyType, customProxyUrl, bypassRules], () => {
  if (!isUpdatingFromProps) {
    syncProxyToForm()
  }
})

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
  console.log('[LLMProfileForm] watch props.modelValue:', newVal?.useNativeApi)
  isUpdatingFromProps = true
  form.value = { ...newVal }
  // 同步代理配置的 refs
  if (newVal?.proxy) {
    proxyType.value = newVal.proxy.type || 'none'
    customProxyUrl.value = newVal.proxy.customUrl || ''
    bypassRules.value = newVal.proxy.bypassRules || 'localhost,127.0.0.1,::1'
  } else {
    proxyType.value = 'none'
    customProxyUrl.value = ''
    bypassRules.value = 'localhost,127.0.0.1,::1'
  }
  console.log('[LLMProfileForm] form.value.useNativeApi after update:', form.value.useNativeApi)
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
  console.log('[LLMProfileForm] onMounted - props.modelValue.useNativeApi:', props.modelValue?.useNativeApi)
  console.log('[LLMProfileForm] onMounted - form.value.useNativeApi before:', form.value.useNativeApi)

  // 阻止 onMounted 中的修改触发 watch(form) 的 emit
  isUpdatingFromProps = true

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
  // 确保 useNativeApi 有正确的布尔值（仅当确实没有值时）
  if (form.value.useNativeApi === undefined || form.value.useNativeApi === null) {
    form.value.useNativeApi = false
  }

  // 初始化代理配置
  if (props.modelValue?.proxy) {
    proxyType.value = props.modelValue.proxy.type || 'none'
    customProxyUrl.value = props.modelValue.proxy.customUrl || ''
    bypassRules.value = props.modelValue.proxy.bypassRules || 'localhost,127.0.0.1,::1'
  }
  // 同步代理到 form
  syncProxyToForm()

  console.log('[LLMProfileForm] onMounted - form.value.useNativeApi after:', form.value.useNativeApi)

  // 下一个 tick 后重置标志位，允许后续用户输入触发 emit
  setTimeout(() => {
    isUpdatingFromProps = false
  }, 0)
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

  .api-key-input {
    display: flex;
    gap: $spacing-sm;

    .input {
      flex: 1;
    }

    .btn-toggle-visibility {
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

  .api-mode-select {
    display: flex;
    gap: $spacing-lg;
    margin-bottom: $spacing-xs;
  }

  .proxy-type-select {
    display: flex;
    gap: $spacing-lg;
    margin-bottom: $spacing-xs;
    flex-wrap: wrap;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    cursor: pointer;
    user-select: none;

    input[type="radio"] {
      cursor: pointer;
    }

    span {
      font-size: $font-size-md;
      color: $text-primary;
    }
  }
}
</style>
