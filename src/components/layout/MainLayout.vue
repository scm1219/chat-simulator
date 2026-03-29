<template>
  <div class="main-layout" :class="{ 'right-hidden': !rightPanelVisible }">
    <aside class="left-pane">
      <LeftPanel />
    </aside>
    <main class="center-pane">
      <ChatWindow />
    </main>
    <div class="panel-divider" @dblclick="toggleRightPanel" :title="rightPanelVisible ? '双击隐藏侧栏' : '双击显示侧栏'"></div>
    <aside class="right-pane">
      <CharacterPanel />
    </aside>
  </div>
</template>

<script setup>
import { ref, provide, onMounted } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import LeftPanel from './LeftPanel.vue'
import ChatWindow from '../chat/ChatWindow.vue'
import CharacterPanel from '../chat/CharacterPanel.vue'

const groupsStore = useGroupsStore()

// 右侧面板显隐状态
const rightPanelVisible = ref(true)

function toggleRightPanel() {
  rightPanelVisible.value = !rightPanelVisible.value
}

provide('rightPanelVisible', rightPanelVisible)
provide('toggleRightPanel', toggleRightPanel)

onMounted(() => {
  groupsStore.loadGroups()
})
</script>

<style lang="scss" scoped>
.main-layout {
  display: grid;
  grid-template-columns: $layout-left-width $layout-center-width 4px $layout-right-width;
  height: 100vh;
  background: $bg-secondary;
  transition: grid-template-columns 0.3s ease;

  &.right-hidden {
    grid-template-columns: $layout-left-width $layout-center-width 4px 0px;
  }
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

.panel-divider {
  background: $border-color;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: $wechat-green;
  }
}

.right-pane {
  background: $bg-primary;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
  transition: opacity 0.2s ease;
}
</style>
