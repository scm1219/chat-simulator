<template>
  <div class="event-panel">
    <div class="panel-header">
      <h4>推荐事件</h4>
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
        <span>{{ evt.content }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useNarrativeStore } from '../../stores/narrative.js'

const props = defineProps({
  groupId: { type: String, required: true },
  sceneType: { type: String, default: 'general' }
})

const emit = defineEmits(['eventTriggered'])

const narrativeStore = useNarrativeStore()
const suggestions = ref([])
const recentEvents = ref([])

onMounted(() => { refresh() })

watch(() => props.groupId, () => { refresh() })

async function refresh() {
  await narrativeStore.fetchEventSuggestions(props.groupId, props.sceneType)
  suggestions.value = narrativeStore.eventSuggestions
  await narrativeStore.fetchRecentEvents(props.groupId)
  recentEvents.value = narrativeStore.recentEvents
}

async function handleTrigger(event) {
  await narrativeStore.triggerEvent(props.groupId, event.key, event.content, event.impact)
  emit('eventTriggered', event)
  await refresh()
}
</script>

<style lang="scss" scoped>
.event-panel { padding: 8px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; h4 { margin: 0; font-size: 13px; } }
.btn-refresh { background: none; border: 1px solid #ddd; border-radius: 12px; padding: 2px 10px; font-size: 11px; cursor: pointer; color: #666; &:hover { border-color: #07c160; color: #07c160; } }
.empty-tip { color: #999; font-size: 12px; text-align: center; padding: 12px; }
.event-card { display: flex; align-items: center; gap: 6px; padding: 8px; background: #f8f8f8; border-radius: 8px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s; &:hover { background: #e8f5e9; } }
.event-impact { font-size: 11px; color: #fff; background: #07c160; border-radius: 8px; padding: 1px 6px; white-space: nowrap; }
.event-content { font-size: 12px; color: #333; }
.recent-events { margin-top: 12px; h5 { margin: 0 0 6px; font-size: 12px; color: #666; } }
.recent-event { font-size: 11px; color: #888; padding: 4px 0; display: flex; align-items: center; gap: 4px; }
.event-type-badge { font-size: 10px; background: #e0e0e0; border-radius: 4px; padding: 0 4px; color: #666; }
</style>
