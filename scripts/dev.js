// Windows 平台开发启动脚本
// 设置控制台代码页为 UTF-8，解决中文乱码问题

import { spawn, execSync } from 'child_process'

// Windows 平台设置控制台代码页为 UTF-8
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'inherit' })
  } catch {
    // 忽略错误
  }
}

// 启动 electron-vite dev
const child = spawn('electron-vite', ['dev'], {
  stdio: 'inherit',
  shell: true
})

child.on('error', (err) => {
  console.error('Failed to start electron-vite:', err)
  process.exit(1)
})

child.on('exit', (code) => {
  process.exit(code || 0)
})
