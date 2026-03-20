<template>
  <div class="dialog-overlay" @click.self="closeDialog">
    <div class="dialog">
      <div class="dialog-header">
        <h3>🎲 角色抽卡</h3>
        <button class="btn-close" @click="closeDialog">×</button>
      </div>

      <div class="dialog-body">
        <!-- 提示输入 -->
        <div v-if="!generatedCharacter" class="gacha-form">
          <div class="form-group">
            <label class="form-label">角色提示（可选）</label>
            <textarea
              v-model="hint"
              class="input textarea"
              placeholder="例如：一个活泼可爱的女孩、一个严肃的科学家、一个神秘的魔法师..."
              rows="4"
              maxlength="200"
            ></textarea>
            <div class="form-hint">{{ hint.length }}/200</div>
          </div>

          <div class="gacha-tip">
            <p>点击"开始抽卡"让 AI 为你生成一个随机角色</p>
          </div>
        </div>

        <!-- 生成结果 -->
        <div v-else class="gacha-result">
          <div class="result-anim">
            <div class="sparkle">✨</div>
            <h4>抽卡成功！</h4>
          </div>

          <div class="character-preview">
            <div class="preview-field">
              <label class="field-label">姓名</label>
              <div class="field-value">{{ generatedCharacter.name }}</div>
            </div>

            <div class="preview-row">
              <div class="preview-field">
                <label class="field-label">性别</label>
                <div class="field-value">{{ getGenderLabel(generatedCharacter.gender) }}</div>
              </div>
              <div class="preview-field">
                <label class="field-label">年龄</label>
                <div class="field-value">{{ generatedCharacter.age }}岁</div>
              </div>
            </div>

            <div class="preview-field">
              <label class="field-label">人物设定</label>
              <div class="field-value field-prompt">{{ generatedCharacter.systemPrompt }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button class="btn btn-secondary" @click="closeDialog">
          {{ generatedCharacter ? '取消' : '关闭' }}
        </button>
        <button
          v-if="!generatedCharacter"
          class="btn btn-gacha"
          :disabled="generating || !canGenerate"
          @click="handleGenerate"
        >
          {{ generating ? '🎲 抽卡中...' : '🎲 开始抽卡' }}
        </button>
        <button
          v-else
          class="btn btn-primary"
          @click="handleConfirm"
        >
          添加到角色库
        </button>
        <button
          v-if="generatedCharacter"
          class="btn btn-secondary"
          @click="handleRegenerate"
        >
          🔄 重新抽卡
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useGlobalCharactersStore } from '../../stores/global-characters.js'
import { useToastStore } from '../../stores/toast'

const emit = defineEmits(['close', 'created'])

const globalCharsStore = useGlobalCharactersStore()
const toast = useToastStore()

const hint = ref('')
const generating = ref(false)
const generatedCharacter = ref(null)

const canGenerate = computed(() => {
  return hint.value.trim().length >= 0 || !hint.value.trim()
})

// 性别标签
function getGenderLabel(gender) {
  const labels = {
    male: '男',
    female: '女',
    other: '其他'
  }
  return labels[gender] || '未知'
}

// 生成角色
async function handleGenerate() {
  generating.value = true
  generatedCharacter.value = null

  try {
    const result = await window.electronAPI.llm.generateCharacter(hint.value.trim())

    if (result.success) {
      generatedCharacter.value = result.data
      toast.success('角色生成成功！')
    } else {
      toast.error('生成失败：' + result.error)
    }
  } catch (error) {
    console.error('生成角色失败', error)
    toast.error('生成失败：' + error.message)
  } finally {
    generating.value = false
  }
}

// 确认添加
async function handleConfirm() {
  if (!generatedCharacter.value) return

  try {
    await globalCharsStore.createCharacter({
      name: generatedCharacter.value.name,
      gender: generatedCharacter.value.gender,
      age: generatedCharacter.value.age,
      systemPrompt: generatedCharacter.value.systemPrompt
    })

    toast.success('角色已添加到角色库')
    emit('created')
    closeDialog()
  } catch (error) {
    toast.error('添加失败：' + error.message)
  }
}

// 重新生成
function handleRegenerate() {
  generatedCharacter.value = null
}

// 关闭对话框
function closeDialog() {
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
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: $bg-primary;
  border-radius: $border-radius-lg;
  width: 520px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: $shadow-lg;
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

.dialog-body {
  padding: $spacing-lg;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: $spacing-lg;
}

.form-label {
  display: block;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  margin-bottom: $spacing-sm;
  color: $text-primary;
}

.input {
  width: 100%;
  padding: $spacing-md;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  font-size: $font-size-md;
  transition: border-color 0.2s;

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
  height: 100px;
  min-height: 100px;
  font-family: inherit;
  line-height: 1.6;
}

.form-hint {
  font-size: $font-size-xs;
  color: $text-placeholder;
  text-align: right;
  margin-top: $spacing-xs;
}

.gacha-tip {
  padding: $spacing-md 0;
  text-align: center;

  p {
    margin: 0;
    font-size: $font-size-sm;
    color: $text-secondary;

    &::before {
      content: '💡 ';
    }
  }
}

.gacha-result {
  .result-anim {
    text-align: center;
    padding: $spacing-lg 0;
    margin-bottom: $spacing-lg;
    background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
    border-radius: $border-radius-md;
    position: relative;

    .sparkle {
      font-size: 48px;
      animation: sparkle 1s ease-in-out infinite;
    }

    h4 {
      margin: $spacing-md 0 0 0;
      font-size: $font-size-xl;
      font-weight: $font-weight-bold;
      color: #2d3436;
    }
  }
}

@keyframes sparkle {
  0%, 100% {
    transform: scale(1) rotate(0deg);
  }
  50% {
    transform: scale(1.2) rotate(10deg);
  }
}

.character-preview {
  background: $bg-secondary;
  padding: $spacing-lg;
  border-radius: $border-radius-md;
}

.preview-field {
  margin-bottom: $spacing-lg;

  &:last-child {
    margin-bottom: 0;
  }
}

.preview-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $spacing-lg;
  margin-bottom: $spacing-lg;
}

.field-label {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-secondary;
  margin-bottom: $spacing-sm;
  display: block;
}

.field-value {
  font-size: $font-size-md;
  color: $text-primary;
  line-height: 1.6;
  background: $bg-primary;
  padding: $spacing-md;
  border-radius: $border-radius-sm;
  border: 1px solid $border-color;

  &.field-prompt {
    min-height: 120px;
    white-space: pre-wrap;
  }
}

.dialog-footer {
  padding: $spacing-lg;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  flex-wrap: wrap;
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
    background: darken($bg-tertiary, 5%);
  }
}

.btn-primary {
  background: $wechat-green;
  color: white;

  &:hover:not(:disabled) {
    background: darken($wechat-green, 5%);
  }
}

.btn-gacha {
  background: linear-gradient(135deg, #ff9a56 0%, #ff6b6b 100%);
  color: white;
  padding: $spacing-sm $spacing-xl;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }
}
</style>
