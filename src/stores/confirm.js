import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useConfirmStore = defineStore('confirm', () => {
  const visible = ref(false)
  const options = ref(null)
  let resolveFn = null

  // options: { title, message, confirmText, cancelText, confirmType }
  // 返回 Promise<boolean>；ConfirmHost 负责渲染并调用 resolve
  const confirm = (opts) => {
    return new Promise((resolve) => {
      // 若已有 pending，先以 undefined 结束前一个，避免旧 Promise 永久悬挂
      resolveFn?.(undefined)
      options.value = { ...opts }
      visible.value = true
      resolveFn = resolve
    })
  }

  const resolve = (value) => {
    visible.value = false
    if (resolveFn) {
      resolveFn(value)
      resolveFn = null
    }
  }

  return { visible, options, confirm, resolve }
})
