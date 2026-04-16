import { app, BrowserWindow } from 'electron'
import path from 'path'

// 保持对窗口对象的全局引用
let mainWindow = null

// 数据库管理器
let dbManager = null

function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/index.cjs')
  console.log('Preload path:', preloadPath)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    },
    backgroundColor: '#f5f5f5',
    show: false
  })

  // 开发环境加载 Vite 服务器，生产环境加载构建文件
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

  if (isDev) {
    console.log('Loading dev URL:', devUrl)
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools()
  } else {
    console.log('Loading production file')
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    // 生产环境设置 CSP，禁止 unsafe-eval
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://* http://*; img-src 'self' data: blob: https://* http://*"
          ]
        }
      })
    })
  }

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show')
    mainWindow.show()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page finished loading')
    mainWindow.webContents.executeJavaScript(`
      console.log('[Renderer] window.electronAPI:', window.electronAPI);
      console.log('[Renderer] electronAPI keys:', window.electronAPI ? Object.keys(window.electronAPI) : 'undefined');
    `).then(() => console.log('[Main] executeJavaScript completed'))
      .catch(err => console.error('[Main] executeJavaScript error:', err))
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 全局角色库管理器
let globalCharManager = null

// 角色记忆管理器
let memoryManager = null

// 应用就绪时创建窗口
app.whenReady().then(async () => {
  // 动态导入模块
  const { DatabaseManager } = await import('./database/manager.js')
  const { GlobalCharacterManager } = await import('./database/global-character-manager.js')
  const { MemoryManager } = await import('./database/memory-manager.js')
  const { setupGroupHandlers } = await import('./ipc/handlers/group.js')
  const { setupCharacterHandlers } = await import('./ipc/handlers/character.js')
  const { setupMessageHandlers } = await import('./ipc/handlers/message.js')
  const { setupLLMHandlers } = await import('./ipc/handlers/llm.js')
  const { setupConfigHandlers } = await import('./ipc/handlers/config.js')
  const { setupGlobalCharacterHandlers } = await import('./ipc/handlers/global-character.js')
  const { setupMemoryHandlers } = await import('./ipc/handlers/memory.js')
  const { setupSearchHandlers } = await import('./ipc/handlers/search.js')
  const { NarrativeEngine } = await import('./narrative/engine.js')
  const { setupNarrativeHandlers } = await import('./ipc/handlers/narrative.js')

  // 初始化数据库管理器
  dbManager = new DatabaseManager()

  // 初始化全局角色库管理器
  globalCharManager = new GlobalCharacterManager()

  // 初始化角色记忆管理器
  memoryManager = new MemoryManager()

  // 初始化叙事引擎
  const narrativeEngine = new NarrativeEngine()
  narrativeEngine.setDBManager(dbManager)

  // 设置 IPC 处理器（必须在创建窗口之前完成）
  setupGroupHandlers(dbManager)
  setupCharacterHandlers(dbManager)
  setupMessageHandlers(dbManager)
  setupLLMHandlers(dbManager, memoryManager, narrativeEngine)
  setupConfigHandlers(dbManager)
  setupGlobalCharacterHandlers(dbManager, globalCharManager)
  setupMemoryHandlers(memoryManager)
  setupSearchHandlers(dbManager)
  setupNarrativeHandlers(narrativeEngine)

  // 所有处理程序注册完成后再创建窗口
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前清理
app.on('before-quit', () => {
  // 关闭所有数据库连接
  if (dbManager) {
    dbManager.closeAll()
  }
  // 关闭全局角色库数据库连接
  if (globalCharManager) {
    globalCharManager.close()
  }
  // 关闭角色记忆数据库连接
  if (memoryManager) {
    memoryManager.close()
  }
})

export { mainWindow }
