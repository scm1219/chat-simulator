import { useConfirmStore } from '../stores/confirm.js'

// 薄壳：保持 confirm(options) → Promise<boolean> 签名不变，
// 实际渲染由 App.vue 挂载的 ConfirmHost 完成（Pinia 上下文内，可用任意 store/注入）
export function useDialog() {
  const confirmStore = useConfirmStore()
  return {
    confirm: (options) => confirmStore.confirm(options)
  }
}
