import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '../composables/useApi.js'

export const useNarrativeStore = defineStore('narrative', () => {
  const emotions = ref([])
  const relationships = ref([])
  const eventSuggestions = ref([])
  const recentEvents = ref([])
  const staleness = ref({ stale: false, reason: null })
  const aftermathMessages = ref([])
  const { silent, call } = useApi('Narrative')

  let emotionsSeq = 0 // 加载请求序号：防止快速切换群组时慢响应覆盖新群组数据

  async function fetchEmotions(groupId) {
    const seq = ++emotionsSeq
    const r = await silent(() => window.electronAPI.narrative.getEmotions(groupId))
    if (seq !== emotionsSeq) return // 已有更新的加载请求，丢弃过期响应
    if (r?.success) emotions.value = r.data
  }

  async function fetchRelationships(groupId) {
    const r = await silent(() => window.electronAPI.narrative.getRelationships(groupId))
    if (r?.success) relationships.value = r.data
  }

  async function setRelationship(groupId, fromId, toId, type, description = '') {
    const rel = await call(() => window.electronAPI.narrative.setRelationship(groupId, fromId, toId, type, description))
    await fetchRelationships(groupId)
    return rel
  }

  async function removeRelationship(groupId, fromId, toId) {
    await call(() => window.electronAPI.narrative.removeRelationship(groupId, fromId, toId))
    await fetchRelationships(groupId)
  }

  async function fetchEventSuggestions(groupId, sceneType) {
    const r = await silent(() => window.electronAPI.narrative.getEventSuggestions(groupId, sceneType))
    if (r?.success) eventSuggestions.value = r.data
  }

  async function fetchRecentEvents(groupId) {
    const r = await silent(() => window.electronAPI.narrative.getRecentEvents(groupId))
    if (r?.success) recentEvents.value = r.data
  }

  async function triggerEvent(groupId, eventKey, content, impact) {
    const result = await call(() => window.electronAPI.narrative.triggerEvent(groupId, eventKey, content, impact))
    await fetchRecentEvents(groupId)
    return result
  }

  async function checkStaleness(groupId) {
    const r = await silent(() => window.electronAPI.narrative.checkStaleness(groupId))
    if (r?.success) staleness.value = r.data
  }

  async function deleteEvent(groupId, eventId) {
    // 该 IPC 成功时返回 { success, deletedMessages }（无 data 字段），
    // 适配为 call 的 { success, data } 约定，使失败走统一的日志与抛错路径
    const deletedMessages = await call(async () => {
      const result = await window.electronAPI.narrative.deleteEvent(groupId, eventId)
      return result.success ? { success: true, data: !!result.deletedMessages } : result
    })
    await fetchRecentEvents(groupId)
    return deletedMessages
  }

  function setupAftermathListener() {
    return window.electronAPI.narrative.onAftermath((msg) => {
      aftermathMessages.value.push(msg)
    })
  }

  function clearAftermath() {
    aftermathMessages.value = []
  }

  return {
    emotions, relationships, eventSuggestions, recentEvents,
    staleness, aftermathMessages,
    fetchEmotions, fetchRelationships, setRelationship, removeRelationship,
    fetchEventSuggestions, fetchRecentEvents, triggerEvent, deleteEvent,
    checkStaleness, setupAftermathListener, clearAftermath
  }
})
