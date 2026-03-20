<template>
  <div class="left-panel">
    <div class="tab-header">
      <button
        :class="['tab-btn', { active: activeTab === 'groups' }]"
        @click="activeTab = 'groups'"
      >
        聊天群
      </button>
      <button
        :class="['tab-btn', { active: activeTab === 'library' }]"
        @click="activeTab = 'library'"
      >
        角色库
      </button>
    </div>

    <div class="tab-content">
      <GroupList
        v-show="activeTab === 'groups'"
        @show-llm-config="$emit('show-llm-config')"
      />
      <CharacterLibrary
        v-show="activeTab === 'library'"
        @show-llm-config="$emit('show-llm-config')"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import GroupList from './GroupList.vue'
import CharacterLibrary from './CharacterLibrary.vue'
import { useGlobalCharactersStore } from '../../stores/global-characters.js'

defineEmits(['show-llm-config'])

const activeTab = ref('groups')
const globalCharsStore = useGlobalCharactersStore()

onMounted(() => {
  // 切换到角色库 Tab 时加载角色
  // 这里预加载，避免切换时的延迟
  globalCharsStore.loadCharacters()
})
</script>

<style lang="scss" scoped>
.left-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tab-header {
  display: flex;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: $spacing-md $spacing-lg;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: $font-size-md;
  color: $text-secondary;
  transition: all 0.2s;
  position: relative;

  &:hover {
    background: $bg-secondary;
  }

  &.active {
    color: $wechat-green;
    font-weight: $font-weight-medium;

    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 40px;
      height: 2px;
      background: $wechat-green;
      border-radius: 1px;
    }
  }
}

.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
