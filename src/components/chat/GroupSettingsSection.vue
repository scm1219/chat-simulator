<template>
      <!-- 群设置 -->
      <div class="panel-section group-settings-section">
        <div class="section-header" @click="groupSettingsCollapsed = !groupSettingsCollapsed">
          <h3>群设置</h3>
          <div class="section-header-actions">
            <button class="btn btn-link btn-sm" @click.stop="$emit('open-settings')">
              ⚙️ 编辑
            </button>
            <span class="collapse-icon" :class="{ collapsed: groupSettingsCollapsed }">▼</span>
          </div>
        </div>
        <div class="group-settings-body" :class="{ collapsed: groupSettingsCollapsed }">
          <div class="group-settings-body-inner">
          <div class="setting-item inline-setting">
            <label>最大历史轮数</label>
            <input
              type="number"
              :value="group.max_history"
              @change="updateMaxHistory"
              class="input setting-input number-input"
              min="1"
              max="50"
            />
          </div>
          <div class="setting-item inline-setting">
            <label>回复模式</label>
            <div class="radio-group">
              <label class="radio-option">
                <input
                  type="radio"
                  name="response-mode"
                  :value="group.response_mode"
                  :checked="group.response_mode === 'sequential'"
                  @change="updateResponseMode({ target: { value: 'sequential' }})"
                />
                <span>顺序</span>
              </label>
              <label class="radio-option">
                <input
                  type="radio"
                  name="response-mode"
                  :value="group.response_mode"
                  :checked="group.response_mode === 'parallel'"
                  @change="updateResponseMode({ target: { value: 'parallel' }})"
                />
                <span>并行</span>
              </label>
            </div>
          </div>
          <div class="setting-item inline-setting">
            <label>思考模式</label>
            <div class="radio-group">
              <label class="radio-option">
                <input
                  type="radio"
                  name="thinking-mode"
                  :checked="group.thinking_enabled === 1"
                  @change="updateThinkingMode({ target: { checked: true }})"
                />
                <span>是</span>
              </label>
              <label class="radio-option">
                <input
                  type="radio"
                  name="thinking-mode"
                  :checked="group.thinking_enabled === 0"
                  @change="updateThinkingMode({ target: { checked: false }})"
                />
                <span>否</span>
              </label>
            </div>
          </div>
          <div class="setting-item inline-setting">
            <label>随机发言</label>
            <div class="radio-group">
              <label class="radio-option">
                <input
                  type="radio"
                  name="random-order"
                  :checked="group.random_order === 1"
                  @change="updateRandomOrder({ target: { checked: true }})"
                />
                <span>是</span>
              </label>
              <label class="radio-option">
                <input
                  type="radio"
                  name="random-order"
                  :checked="group.random_order === 0"
                  @change="updateRandomOrder({ target: { checked: false }})"
                />
                <span>否</span>
              </label>
            </div>
          </div>
          </div>
        </div>
      </div>
</template>

<script setup>
import { ref } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useCharactersStore } from '../../stores/characters.js'
import { useToastStore } from '../../stores/toast'
import { createLogger } from '../../utils/logger.js'

const props = defineProps({
  group: { type: Object, required: true }
})

defineEmits(['open-settings'])

const log = createLogger('GroupSettings')
const groupsStore = useGroupsStore()
const charactersStore = useCharactersStore()
const toast = useToastStore()

const groupSettingsCollapsed = ref(true) // 默认收起

async function updateMaxHistory(event) {
  const v = parseInt(event.target.value, 10)
  if (!Number.isInteger(v) || v < 1 || v > 50) {
    // 非法输入回显为当前生效值
    event.target.value = String(props.group?.max_history ?? 20)
    toast.error('历史条数需为 1-50 的整数')
    return
  }
  try {
    await groupsStore.updateGroup(props.group.id, {
      maxHistory: v
    })
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}

async function updateResponseMode(event) {
  try {
    await groupsStore.updateGroup(props.group.id, {
      responseMode: event.target.value
    })
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}

async function updateThinkingMode(event) {
  try {
    const enabled = event.target.checked
    await groupsStore.updateGroup(props.group.id, {
      thinkingEnabled: enabled
    })

    // 批量更新所有 AI 角色的思考模式（并行）
    const aiCharacters = charactersStore.characters.filter(c => c.is_user !== 1)
    await Promise.all(aiCharacters.map(char =>
      charactersStore.updateCharacter(char.id, { thinkingEnabled: enabled }).catch(err => {
        log.error(`更新角色 ${char.name} 思考模式失败:`, err)
      })
    ))

    // 重新加载角色列表以确保 UI 正确刷新
    await charactersStore.loadCharacters(props.group.id)
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}

async function updateRandomOrder(event) {
  try {
    await groupsStore.updateGroup(props.group.id, {
      randomOrder: event.target.checked
    })
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}
</script>

<style lang="scss" scoped>
.panel-section {
  padding: $spacing-lg;
  border-bottom: 1px solid $border-color;

  h3 {
    font-size: $font-size-md;
    font-weight: $font-weight-medium;
    margin-bottom: $spacing-md;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: $spacing-md;

    h3 {
      margin-bottom: 0;
    }
  }

  &.group-settings-section {
    .section-header {
      cursor: pointer;
      user-select: none;
      margin-bottom: 0;

      &:hover {
        h3 {
          color: $color-primary;
        }
      }
    }

    .section-header-actions {
      display: flex;
      align-items: center;
      gap: $spacing-sm;
    }

    .collapse-icon {
      font-size: $font-size-xs;
      color: $text-secondary;
      transition: transform 0.2s ease;
      display: inline-block;

      &.collapsed {
        transform: rotate(-90deg);
      }
    }

    .group-settings-body {
      display: grid;
      grid-template-rows: 1fr;
      transition: grid-template-rows 0.3s ease;

      &.collapsed {
        grid-template-rows: 0fr;
      }

      .group-settings-body-inner {
        overflow: hidden;
      }
    }
  }
}

.setting-item {
  margin-top: $spacing-md;

  label {
    display: block;
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-bottom: $spacing-sm;
  }

  &.inline-setting {
    display: flex;
    align-items: center;
    gap: $spacing-md;

    label {
      flex-shrink: 0;
      margin-bottom: 0;
      white-space: nowrap;
    }

    .number-input {
      width: 80px;
      flex-shrink: 0;
    }
  }

  .setting-input {
    width: 100%;
  }

  .radio-group {
    display: flex;
    gap: $spacing-lg;
    padding: 0;

    .radio-option {
      display: flex;
      align-items: center;
      gap: $spacing-xs;
      cursor: pointer;
      user-select: none;

      input[type="radio"] {
        cursor: pointer;
        width: 16px;
        height: 16px;
        accent-color: $color-primary;
      }

      span {
        font-size: $font-size-md;
        color: $text-primary;
      }

      &:hover span {
        color: $color-primary;
      }
    }
  }
}
</style>
