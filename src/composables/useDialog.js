import { createApp, h, ref, onMounted } from 'vue'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'

export function useDialog() {
  const confirm = (options) => {
    return new Promise((resolve) => {
      const container = document.createElement('div')
      document.body.appendChild(container)

      const app = createApp({
        setup() {
          const dialogRef = ref(null)

          const handleConfirm = () => {
            cleanup()
            resolve(true)
          }

          const handleCancel = () => {
            cleanup()
            resolve(false)
          }

          const cleanup = () => {
            app.unmount()
            if (document.body.contains(container)) {
              document.body.removeChild(container)
            }
          }

          onMounted(() => {
            if (dialogRef.value) {
              dialogRef.value.show()
            }
          })

          return () => h(ConfirmDialog, {
            ref: dialogRef,
            ...options,
            onConfirm: handleConfirm,
            onCancel: handleCancel
          })
        }
      })

      app.mount(container)
    })
  }

  return {
    confirm
  }
}
