<template>
  <div class="relationship-panel">
    <div class="panel-header">
      <h4>角色关系</h4>
      <button class="btn-add" @click="showAddDialog = true" title="添加关系">+</button>
    </div>

    <div v-if="relationshipList.length === 0" class="empty-tip">
      暂无角色关系，点击 + 添加
    </div>

    <div v-for="rel in relationshipList" :key="`${rel.from_id}-${rel.to_id}`" class="relationship-item">
      <div class="rel-info">
        <span class="rel-from">{{ getCharName(rel.from_id) }}</span>
        <span class="rel-arrow" :class="`favor-${getFavorClass(rel.favorability)}`">&#8594;</span>
        <span class="rel-to">{{ getCharName(rel.to_id) }}</span>
      </div>
      <div class="rel-meta">
        <span class="rel-type">{{ getTypeLabel(rel.type) }}</span>
        <div class="favor-bar">
          <div class="favor-fill" :style="{ width: getFavorWidth(rel.favorability) + '%' }"></div>
        </div>
        <span class="favor-value" :class="`favor-${getFavorClass(rel.favorability)}`">
          {{ rel.favorability }}
        </span>
      </div>
      <button class="btn-remove" @click="handleRemove(rel.from_id, rel.to_id)" title="删除">&times;</button>
    </div>

    <div v-if="showAddDialog" class="dialog-overlay" @click.self="showAddDialog = false">
      <div class="dialog-content">
        <h4>添加角色关系</h4>
        <div class="form-row">
          <label>从</label>
          <select v-model="form.fromId">
            <option v-for="char in characters" :key="char.id" :value="char.id">{{ char.name }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>到</label>
          <select v-model="form.toId">
            <option v-for="char in characters" :key="char.id" :value="char.id">{{ char.name }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>关系</label>
          <select v-model="form.type">
            <option v-for="(config, key) in relationshipTypes" :key="key" :value="key">{{ config.label }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>描述</label>
          <input v-model="form.description" placeholder="可选" />
        </div>
        <div class="dialog-actions">
          <button @click="showAddDialog = false">取消</button>
          <button class="btn-primary" @click="handleAdd">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useNarrativeStore } from '../../stores/narrative.js'

const props = defineProps({
  groupId: { type: String, required: true },
  characters: { type: Array, default: () => [] }
})

const narrativeStore = useNarrativeStore()
const showAddDialog = ref(false)
const relationshipTypes = ref({})
const form = ref({ fromId: '', toId: '', type: 'friend', description: '' })

const relationshipList = computed(() => narrativeStore.relationships)

onMounted(async () => {
  const result = await window.electronAPI.narrative.getRelationshipTypes()
  if (result.success) relationshipTypes.value = result.data
  await narrativeStore.fetchRelationships(props.groupId)
})

watch(() => props.groupId, () => {
  narrativeStore.fetchRelationships(props.groupId)
})

const charMap = computed(() => new Map(props.characters.map(c => [c.id, c.name])))

function getCharName(id) { return charMap.value.get(id) || '未知' }
function getTypeLabel(type) { return relationshipTypes.value[type]?.label || type }

function getFavorClass(f) {
  if (f >= 40) return 'good'
  if (f >= 10) return 'ok'
  if (f >= -10) return 'neutral'
  if (f >= -50) return 'bad'
  return 'worst'
}

function getFavorWidth(f) { return Math.max(0, Math.min(100, (f + 100) / 2)) }

async function handleAdd() {
  if (!form.value.fromId || !form.value.toId || form.value.fromId === form.value.toId) return
  await narrativeStore.setRelationship(
    props.groupId, form.value.fromId, form.value.toId,
    form.value.type, form.value.description
  )
  showAddDialog.value = false
  form.value = { fromId: '', toId: '', type: 'friend', description: '' }
}

async function handleRemove(fromId, toId) {
  await narrativeStore.removeRelationship(props.groupId, fromId, toId)
}
</script>

<style lang="scss" scoped>
.relationship-panel { padding: 8px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; h4 { margin: 0; font-size: 13px; } }
.btn-add { background: #07c160; color: #fff; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 14px; }
.empty-tip { color: #999; font-size: 12px; text-align: center; padding: 16px; }
.relationship-item { background: #f8f8f8; border-radius: 8px; padding: 8px; margin-bottom: 6px; position: relative; }
.rel-info { font-size: 13px; margin-bottom: 4px; }
.rel-arrow { margin: 0 4px; font-weight: bold; }
.rel-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.rel-type { color: #666; min-width: 36px; }
.favor-bar { flex: 1; height: 4px; background: #e0e0e0; border-radius: 2px; overflow: hidden; }
.favor-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
.favor-good .favor-fill { background: #07c160; }
.favor-ok .favor-fill { background: #8bc34a; }
.favor-neutral .favor-fill { background: #ffc107; }
.favor-bad .favor-fill { background: #ff9800; }
.favor-worst .favor-fill { background: #f44336; }
.favor-value { min-width: 28px; text-align: right; }
.favor-good { color: #07c160; } .favor-ok { color: #8bc34a; } .favor-neutral { color: #ffc107; }
.favor-bad { color: #ff9800; } .favor-worst { color: #f44336; }
.btn-remove { position: absolute; top: 4px; right: 6px; background: none; border: none; cursor: pointer; color: #999; font-size: 16px; &:hover { color: #f44336; } }

.dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.dialog-content { background: #fff; border-radius: 12px; padding: 20px; width: 340px; h4 { margin: 0 0 16px; } }
.form-row { margin-bottom: 10px; label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; } select, input { width: 100%; padding: 6px 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; } }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; button { padding: 6px 16px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; } .btn-primary { background: #07c160; color: #fff; border-color: #07c160; } }
</style>
