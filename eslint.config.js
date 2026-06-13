import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  // ── 全局忽略 ──
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      '.zcf/**',
      '.qoder/**',
      '.claude/**',
      'docs/**'
    ]
  },

  // ── 基础 JS 规则 ──
  js.configs.recommended,

  // ── Vue 3 规则 (essential 级别) ──
  ...pluginVue.configs['flat/essential'],

  // ── 渲染进程：src/ 目录使用浏览器环境 ──
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    }
  },

  // ── 主进程 + 预加载：electron/ 目录使用 Node 环境 ──
  {
    files: ['electron/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  },

  // ── 根目录配置文件 + 构建脚本 ──
  {
    files: ['*.config.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  },

  // ── 全局自定义规则 ──
  {
    rules: {
      // 允许未使用变量以 _ 开头（常见于回调函数忽略参数）
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      // 允许 console（Electron 桌面应用，非 web 生产环境）
      'no-console': 'off',
      // 允许 debugger 仅在开发时
      'no-debugger': 'warn',
      // Vue: 关闭单单词组件名要求（项目中有大量单词组件如 Toast, App）
      'vue/multi-word-component-names': 'off',
      // Vue: 对模板中未使用变量降级为 warn
      'vue/no-unused-vars': 'warn'
    }
  }
]
