<template>
  <div class="main-layout">
    <aside class="left-pane">
      <LeftPanel @show-llm-config="showLLMConfig = true" />
    </aside>
    <main class="center-pane">
      <ChatWindow />
    </main>
    <aside class="right-pane">
      <CharacterPanel v-if="!showLLMConfig" @show-llm-config="showLLMConfig = true" />
      <LLMConfigPanel v-else @close="showLLMConfig = false" />
    </aside>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import LeftPanel from './LeftPanel.vue'
import ChatWindow from '../chat/ChatWindow.vue'
import CharacterPanel from '../chat/CharacterPanel.vue'
import LLMConfigPanel from '../config/LLMConfigPanel.vue'

const groupsStore = useGroupsStore()
const showLLMConfig = ref(false)

onMounted(() => {
  groupsStore.loadGroups()
})
</script>

<style lang="scss" scoped>
.main-layout {
  display: grid;
  grid-template-columns: $layout-left-width $layout-center-width $layout-right-width;
  height: 100vh;
  background: $bg-secondary;
}

.left-pane {
  border-right: 1px solid $border-color;
  background: $bg-primary;
}

.center-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: $bg-secondary;
}

.right-pane {
  border-left: 1px solid $border-color;
  background: $bg-primary;
  overflow-y: auto;
}
</style>
