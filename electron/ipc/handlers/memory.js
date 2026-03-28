/**
 * 角色记忆 IPC 处理器
 */
import { ipcMain } from 'electron'

export function setupMemoryHandlers(memoryManager) {
  // 按角色名查询记忆
  ipcMain.handle('memory:getByName', async (event, characterName) => {
    try {
      const memories = memoryManager.getMemoriesByCharacterName(characterName)
      return { success: true, data: memories }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 添加记忆
  ipcMain.handle('memory:add', async (event, data) => {
    try {
      const { characterName, content, source, groupId } = data
      const memory = memoryManager.addMemory({ characterName, content, source, groupId })
      return { success: true, data: memory }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 更新记忆
  ipcMain.handle('memory:update', async (event, id, content) => {
    try {
      const memory = memoryManager.updateMemory(id, content)
      if (!memory) {
        return { success: false, error: '记忆不存在' }
      }
      return { success: true, data: memory }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 删除记忆
  ipcMain.handle('memory:delete', async (event, id) => {
    try {
      const deleted = memoryManager.deleteMemory(id)
      if (!deleted) {
        return { success: false, error: '记忆不存在' }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 查询记忆条数
  ipcMain.handle('memory:getCount', async (event, characterName) => {
    try {
      const count = memoryManager.getMemoryCount(characterName)
      return { success: true, data: count }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
