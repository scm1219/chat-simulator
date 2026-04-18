/**
 * 角色记忆 IPC 处理器
 */
import { ipcMain } from 'electron'
import { createHandler } from '../handler-wrapper.js'

export function setupMemoryHandlers(memoryManager) {
  // 按角色名查询记忆
  ipcMain.handle('memory:getByName', createHandler(async (event, characterName) => {
    const memories = memoryManager.getMemoriesByCharacterName(characterName)
    return { success: true, data: memories }
  }))

  // 添加记忆
  ipcMain.handle('memory:add', createHandler(async (event, data) => {
    const { characterName, content, source, groupId } = data
    const memory = memoryManager.addMemory({ characterName, content, source, groupId })
    return { success: true, data: memory }
  }, 'Memory:add'))

  // 更新记忆
  ipcMain.handle('memory:update', createHandler(async (event, id, content) => {
    const memory = memoryManager.updateMemory(id, content)
    if (!memory) {
      return { success: false, error: '记忆不存在' }
    }
    return { success: true, data: memory }
  }, 'Memory:update'))

  // 删除记忆
  ipcMain.handle('memory:delete', createHandler(async (event, id) => {
    const deleted = memoryManager.deleteMemory(id)
    if (!deleted) {
      return { success: false, error: '记忆不存在' }
    }
    return { success: true }
  }, 'Memory:delete'))

  // 查询记忆条数
  ipcMain.handle('memory:getCount', createHandler(async (event, characterName) => {
    const count = memoryManager.getMemoryCount(characterName)
    return { success: true, data: count }
  }))
}
