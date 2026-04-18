import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useNarrativeStore = defineStore('narrative', () => {
  const emotions = ref([])
  const relationships = ref([])
  const eventSuggestions = ref([])
  const recentEvents = ref([])
  const staleness = ref({ stale: false, reason: null })
  const aftermathMessages = ref([])

  async function fetchEmotions(groupId) {
    const result = await window.electronAPI.narrative.getEmotions(groupId)
    if (result.success) emotions.value = result.data
  }

  async function fetchRelationships(groupId) {
    const result = await window.electronAPI.narrative.getRelationships(groupId)
    if (result.success) relationships.value = result.data
  }

  async function setRelationship(groupId, fromId, toId, type, description = '') {
    const result = await window.electronAPI.narrative.setRelationship(groupId, fromId, toId, type, description)
    if (result.success) await fetchRelationships(groupId)
    return result
  }

  async function removeRelationship(groupId, fromId, toId) {
    const result = await window.electronAPI.narrative.removeRelationship(groupId, fromId, toId)
    if (result.success) await fetchRelationships(groupId)
    return result
  }

  async function fetchEventSuggestions(groupId, sceneType) {
    const result = await window.electronAPI.narrative.getEventSuggestions(groupId, sceneType)
    if (result.success) eventSuggestions.value = result.data
  }

  async function fetchRecentEvents(groupId) {
    const result = await window.electronAPI.narrative.getRecentEvents(groupId)
    if (result.success) recentEvents.value = result.data
  }

  async function triggerEvent(groupId, eventKey, content, impact) {
    const result = await window.electronAPI.narrative.triggerEvent(groupId, eventKey, content, impact)
    if (result.success) await fetchRecentEvents(groupId)
    return result
  }

  async function checkStaleness(groupId) {
    const result = await window.electronAPI.narrative.checkStaleness(groupId)
    if (result.success) staleness.value = result.data
  }

  async function deleteEvent(groupId, eventId) {
    const result = await window.electronAPI.narrative.deleteEvent(groupId, eventId)
    if (result.success) await fetchRecentEvents(groupId)
    return result
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
