// 为当前安装的 Electron 下载 better-sqlite3 的预编译二进制
//
// better-sqlite3 直接使用 V8 API（非 N-API），Node 与 Electron 的原生二进制互不通用：
// 依赖包自己的安装脚本默认下载的是 Node ABI 版本，而应用运行在 Electron 主进程，
// 需要 Electron ABI 版本。本脚本在 postinstall 阶段统一安装 Electron 版本，
// 走官方预编译下载，无需 electron-rebuild 的源码编译（不依赖 MSVC 工具链）。

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

const require = createRequire(import.meta.url)

let electronVersion
let sqliteDir
let prebuildInstallBin
try {
  electronVersion = require('electron/package.json').version
  sqliteDir = dirname(require.resolve('better-sqlite3/package.json'))
  prebuildInstallBin = require.resolve('prebuild-install/bin.js')
} catch (err) {
  console.error(`[rebuild-sqlite] 解析依赖失败，请先完成 pnpm install：${err.message}`)
  process.exit(1)
}

console.log(`[rebuild-sqlite] 安装 better-sqlite3 Electron 预编译：electron@${electronVersion}`)

const result = spawnSync(
  process.execPath,
  [prebuildInstallBin, '-r', 'electron', '-t', electronVersion, '--verbose'],
  { cwd: sqliteDir, stdio: 'inherit' }
)

if (result.error) {
  console.error(`[rebuild-sqlite] 启动 prebuild-install 失败：${result.error.message}`)
  process.exit(1)
}
if (result.status !== 0) {
  console.error(`[rebuild-sqlite] Electron 预编译下载失败（exit ${result.status}）。`)
  console.error('[rebuild-sqlite] 官方会为已正式发布的 Electron 版本提供预编译；若刚升级到尚未支持的版本，可临时改用源码编译：npx @electron/rebuild -f -w better-sqlite3')
  process.exit(result.status ?? 1)
}
