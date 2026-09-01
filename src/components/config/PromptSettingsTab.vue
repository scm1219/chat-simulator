<template>
  <div class="prompt-settings-tab">
    <div v-if="promptLoading" class="prompt-loading">加载中...</div>
    <div v-else class="prompt-settings">
      <div class="form-group">
        <label class="form-label">
          系统提示词
          <span class="label-hint">{{ systemHint }}</span>
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
          <span class="label-hint">{{ templateHint }}</span>
        </label>
        <input
          v-model="promptForm.userPromptTemplate"
          class="input"
          :placeholder="templatePlaceholder"
        />
      </div>

      <div class="form-group">
        <label class="form-label">默认提示（无用户输入时使用）</label>
        <input
          v-model="promptForm.defaultUserPrompt"
          class="input"
          :placeholder="defaultPlaceholder"
        />
      </div>

      <div class="prompt-actions">
        <button class="btn btn-text" @click="resetPrompt">
          恢复默认
        </button>
        <button
          class="btn btn-primary"
          :disabled="!promptDirty"
          @click="savePrompt"
        >
          {{ promptSaving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { usePromptConfig } from '../../composables/usePromptConfig.js'

const props = defineProps({
  // window.electronAPI.config 下的通道 key：'quickGroupConfig' | 'gachaConfig'
  channel: { type: String, required: true },
  systemHint: { type: String, default: '' },
  templateHint: { type: String, default: '' },
  templatePlaceholder: { type: String, default: '' },
  defaultPlaceholder: { type: String, default: '' }
})

const { promptForm, promptDirty, promptLoading, promptSaving, loadPromptConfig, savePrompt, resetPrompt } =
  usePromptConfig(props.channel)

onMounted(loadPromptConfig)
</script>

<style lang="scss" scoped>
@use 'sass:color';

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
}

.textarea {
  resize: none;
  min-height: 80px;
  font-family: inherit;
  line-height: 1.6;
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

.btn-text {
  background: transparent;
  color: $text-secondary;

  &:hover:not(:disabled) {
    color: $text-primary;
    background: $bg-secondary;
  }
}

.btn-primary {
  background: $wechat-green;
  color: white;

  &:hover:not(:disabled) {
    background: color.adjust($wechat-green, $lightness: -5%);
  }
}
</style>
