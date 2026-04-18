<template>
  <div class="event-panel">
    <div class="panel-header">
      <h4>推荐事件</h4>
      <span class="current-scene">{{ sceneLabel }}</span>
      <button class="btn-refresh" @click="refresh" title="换一批">换一批</button>
    </div>

    <div v-if="suggestions.length === 0" class="empty-tip">
      暂无推荐事件
    </div>

    <div v-for="event in suggestions" :key="event.key" class="event-card" @click="handleTrigger(event)">
      <span class="event-impact">{{ event.impact }}</span>
      <span class="event-content">{{ event.content }}</span>
    </div>

    <div class="recent-events" v-if="recentEvents.length > 0">
      <h5>最近事件</h5>
      <div v-for="evt in recentEvents" :key="evt.id" class="recent-event">
        <span class="event-type-badge">{{ evt.event_type === 'user_triggered' ? '手动' : '自动' }}</span>
        <span class="event-scene-badge">{{ evt.scene_label || '未知' }}</span>
        <span class="event-time">{{ formatTime(evt.created_at) }}</span>
        <span class="event-text">{{ evt.content }}</span>
        <button class="btn-delete-event" @click.stop="handleDeleteEvent(evt.id)" title="删除">x</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useNarrativeStore } from '../../stores/narrative.js'

const props = defineProps({
  groupId: { type: String, required: true },
  sceneType: { type: String, default: 'general' }
})

const emit = defineEmits(['eventTriggered', 'eventDeleted'])

const sceneLabels = ref({})
const sceneLabel = computed(() => sceneLabels.value[props.sceneType] || props.sceneType)

async function loadSceneLabels() {
  const result = await window.electronAPI.narrative.getSceneLabels()
  if (result.success) sceneLabels.value = result.data
}

const narrativeStore = useNarrativeStore()
const suggestions = ref([])
const recentEvents = ref([])

onMounted(() => { loadSceneLabels(); refresh() })

watch(() => props.groupId, () => { refresh() })

async function refresh() {
  await narrativeStore.fetchEventSuggestions(props.groupId, props.sceneType)
  suggestions.value = narrativeStore.eventSuggestions
  await narrativeStore.fetchRecentEvents(props.groupId)
  recentEvents.value = narrativeStore.recentEvents
}

async function handleTrigger(event) {
  const result = await narrativeStore.triggerEvent(props.groupId, event.key, event.content, event.impact)
  await refresh()
  if (result.success) {
    emit('eventTriggered', event)
  }
}

async function handleDeleteEvent(eventId) {
  const result = await narrativeStore.deleteEvent(props.groupId, eventId)
  if (result.success) {
    recentEvents.value = narrativeStore.recentEvents
    if (result.deletedMessages) {
      emit('eventDeleted')
    }
  }
}

function formatTime(datetime) {
  if (!datetime) return ''
  const d = new Date(datetime.replace(' ', 'T'))
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  if (msgDate.getTime() === today.getTime()) {
    return hm
  } else if (msgDate.getTime() === yesterday.getTime()) {
    return `昨天 ${hm}`
  } else if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
  } else {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
  }
}
</script>

<style lang="scss" scoped>
.event-panel { padding: 8px; }
.panel-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; h4 { margin: 0; font-size: 13px; } .btn-refresh { margin-left: auto; } }
.current-scene { font-size: 10px; background: #e3f2fd; border-radius: 4px; padding: 1px 6px; color: #1976d2; flex-shrink: 0; }
.btn-refresh { background: none; border: 1px solid #ddd; border-radius: 12px; padding: 2px 10px; font-size: 11px; cursor: pointer; color: #666; &:hover { border-color: #07c160; color: #07c160; } }
.empty-tip { color: #999; font-size: 12px; text-align: center; padding: 12px; }
.event-card { display: flex; align-items: center; gap: 6px; padding: 8px; background: #f8f8f8; border-radius: 8px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s; &:hover { background: #e8f5e9; } }
.event-impact { font-size: 11px; color: #fff; background: #07c160; border-radius: 8px; padding: 1px 6px; white-space: nowrap; }
.event-content { font-size: 12px; color: #333; }
.recent-events { margin-top: 12px; h5 { margin: 0 0 6px; font-size: 12px; color: #666; } }
.recent-event { font-size: 11px; color: #888; padding: 4px 0; display: flex; align-items: center; gap: 4px; }
.event-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.event-time { font-size: 10px; color: #aaa; flex-shrink: 0; }
.event-scene-badge { font-size: 10px; background: #e3f2fd; border-radius: 4px; padding: 0 4px; color: #1976d2; flex-shrink: 0; }
.event-type-badge { font-size: 10px; background: #e0e0e0; border-radius: 4px; padding: 0 4px; color: #666; flex-shrink: 0; }
.btn-delete-event { background: none; border: none; font-size: 11px; color: #bbb; cursor: pointer; padding: 0 2px; flex-shrink: 0; &:hover { color: #e74c3c; } }
</style>
