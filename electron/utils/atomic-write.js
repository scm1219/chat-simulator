/**
 * 原子写 JSON 工具
 * 先写入同目录临时文件，再用 rename 原子替换目标文件，
 * 避免进程崩溃时 writeFileSync 直接覆盖导致 JSON 截断损坏。
 * Windows 下 Node 的 renameSync 使用 MoveFileEx(REPLACE_EXISTING)，可覆盖已存在目标；
 * 临时文件与目标同目录，保证同卷（rename 跨卷会失败）。
 */
import fs from 'node:fs'

/**
 * 原子写入 JSON 配置文件
 * @param {string} filePath - 目标文件绝对路径
 * @param {*} data - 可被 JSON.stringify 序列化的数据
 */
export function atomicWriteJson(filePath, data) {
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2))
  fs.renameSync(tmpPath, filePath)
}
