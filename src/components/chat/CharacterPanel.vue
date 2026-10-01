<template>
  <div class="character-panel">
    <div v-if="currentGroup" class="panel-content">
      <GroupSettingsSection
        :group="currentGroup"
        @open-settings="showGroupSettings = true"
      />

      <!-- Tab 切换 -->
      <div class="tab-bar">
        <button :class="{ active: activeTab === 'characters' }" @click="activeTab = 'characters'">角色</button>
        <button :class="{ active: activeTab === 'relationships' }" @click="activeTab = 'relationships'">关系</button>
      </div>

      <!-- 角色列表 Tab -->
      <div v-if="activeTab === 'characters'">
        <div class="panel-section">
          <h3>角色列表</h3>
          <button class="btn btn-primary btn-sm" @click="showCreateDialog = true">
            + 添加角色
          </button>
        </div>

        <div class="character-list">
          <CharacterCard
            v-for="(char, index) in charactersStore.characters"
            :key="char.id"
            :character="char"
            :index="index"
            @edit="editCharacter"
            @open-memory="openMemoryDialog"
          />

        <div v-if="charactersStore.characters.length === 0" class="empty-state">
          <p>还没有角色</p>
          <p class="hint">点击"添加角色"创建一个</p>
        </div>
      </div>
      </div>

      <!-- 关系管理 Tab -->
      <div v-else class="relationship-tab">
        <RelationshipPanel :group-id="currentGroup.id" :characters="charactersStore.characters" />
      </div>
    </div>

    <div v-else class="empty-panel">
      <p>请选择一个聊天群</p>
    </div>

    <!-- 创建角色对话框 -->
    <CreateCharacterDialog
      v-if="showCreateDialog"
      :group-id="currentGroup?.id"
      @close="showCreateDialog = false"
      @created="handleCharacterCreated"
    />

    <!-- 编辑角色对话框 -->
    <EditCharacterDialog
      v-if="showEditDialog"
      :character="editingCharacter"
      @close="showEditDialog = false"
      @saved="handleCharacterSaved"
    />

    <!-- 群设置对话框 -->
    <GroupSettingsDialog
      v-if="showGroupSettings"
      :group-id="currentGroup?.id"
      @close="showGroupSettings = false"
      @saved="handleGroupSettingsSaved"
    />

    <!-- 角色记忆对话框 -->
    <MemoryDialog
      v-if="memoryDialogVisible"
      :character="memoryDialogChar"
      @close="memoryDialogVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useCharactersStore } from '../../stores/characters.js'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useNarrativeStore } from '../../stores/narrative.js'
import RelationshipPanel from './RelationshipPanel.vue'
import MemoryDialog from './MemoryDialog.vue'
import GroupSettingsSection from './GroupSettingsSection.vue'
import CharacterCard from './CharacterCard.vue'

// 对话框组件按需异步加载，减小首屏 bundle 体积
const CreateCharacterDialog = defineAsyncComponent(() => import('../config/CreateCharacterDialog.vue'))
const EditCharacterDialog = defineAsyncComponent(() => import('../config/EditCharacterDialog.vue'))
const GroupSettingsDialog = defineAsyncComponent(() => import('../config/GroupSettingsDialog.vue'))

const groupsStore = useGroupsStore()
const charactersStore = useCharactersStore()
const llmProfilesStore = useLLMProfilesStore()
const narrativeStore = useNarrativeStore()
const showCreateDialog = ref(false)
const activeTab = ref('characters') // 'characters' | 'relationships'
const showEditDialog = ref(false)
const showGroupSettings = ref(false)
const memoryDialogVisible = ref(false)  // 记忆对话框可见性
const memoryDialogChar = ref(null)  // 记忆对话框当前角色
const editingCharacter = ref(null)

const currentGroup = computed(() => groupsStore.currentGroup)

// 加载 LLM Profile 列表
onMounted(async () => {
  await llmProfilesStore.loadProfiles()
})

// 监听当前群组变化，获取情绪数据
watch(() => currentGroup.value?.id, async (newId) => {
  if (newId) {
    activeTab.value = 'characters'
    narrativeStore.fetchEmotions(newId)
  }
})

// 打开记忆对话框
function openMemoryDialog(char) {
  memoryDialogChar.value = char
  memoryDialogVisible.value = true
}

function handleCharacterCreated() {
  showCreateDialog.value = false
}

function editCharacter(char) {
  editingCharacter.value = char
  showEditDialog.value = true
}

function handleCharacterSaved() {
  showEditDialog.value = false
  editingCharacter.value = null
}

function handleGroupSettingsSaved() {
  showGroupSettings.value = false
}
</script>

<style lang="scss" scoped>
.character-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tab-bar {
  display: flex;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 8px;

  button {
    flex: 1;
    padding: 8px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 13px;
    color: #999;
    cursor: pointer;

    &.active {
      color: #07c160;
      border-bottom-color: #07c160;
    }
  }
}

.relationship-tab {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
}

.panel-section {
  padding: $spacing-lg;
  border-bottom: 1px solid $border-color;

  h3 {
    font-size: $font-size-md;
    font-weight: $font-weight-medium;
    margin-bottom: $spacing-md;
  }
}

.character-list {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
}

.empty-state,
.empty-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: $text-secondary;
  padding: $spacing-xl;

  .hint {
    font-size: $font-size-sm;
    margin-top: $spacing-sm;
  }
}
</style>
