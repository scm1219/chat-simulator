# 安装说明

由于 pnpm 的安全机制，构建脚本被默认阻止。请按以下步骤完成安装：

## 方法一：使用 pnpm（推荐）

1. **批准构建脚本**：
   ```bash
   cd D:/work/chat
   pnpm approve-builds
   ```
   按 `a` 选择所有包，然后按 `y` 确认

2. **启动开发服务器**：
   ```bash
   pnpm run dev
   ```

## 方法二：使用 npm

如果不想使用 pnpm，可以使用 npm：

1. **删除 pnpm lockfile 和 node_modules**：
   ```bash
   cd D:/work/chat
   rm -rf node_modules pnpm-lock.yaml
   ```

2. **使用 npm 安装**：
   ```bash
   npm install
   ```

3. **启动开发服务器**：
   ```bash
   npm run dev
   ```

## 方法三：手动安装 Electron

如果上述方法都失败，可以手动安装 Electron：

1. **下载 Electron**：
   访问 https://github.com/electron/electron/releases 下载对应版本（v28.3.3）

2. **安装到指定位置**（Windows）：
   将下载的 zip 文件解压到：
   ```
   %LOCALAPPDATA%\electron\Cache\electron\https://github.com/electron/electron/releases/download/v28.3.3/electron-v28.3.3-win32-x64.zip
   ```

3. **启动应用**：
   ```bash
   pnpm run dev
   ```

## 验证安装

安装成功后，你应该看到：
1. Vite 开发服务器在 `http://localhost:5173` 启动
2. Electron 窗口自动打开
3. 应用界面显示三栏布局

## 常见问题

### Q: pnpm approve-builds 卡住不动
A: 按 Ctrl+C 取消，然后运行：`pnpm install --force`

### Q: Electron 安装失败
A: 使用方法二（npm）或方法三（手动安装）

### Q: 应用启动但界面空白
A: 打开开发者工具（DevTools）查看控制台错误信息
