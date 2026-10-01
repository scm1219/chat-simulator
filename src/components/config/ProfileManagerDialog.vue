<template>
  <BaseDialog title="LLM 配置管理" max-width="800px" @close="$emit('close')">
    <ProfileManager ref="manager" />

    <template #footer>
      <button class="btn btn-secondary" @click="$emit('close')">关闭</button>
      <button class="btn btn-primary" @click="manager?.openAdd()">+ 添加配置</button>
    </template>
  </BaseDialog>
</template>

<script setup>
import { ref } from 'vue'
import BaseDialog from '../common/BaseDialog.vue'
import ProfileManager from './ProfileManager.vue'

defineEmits(['close'])

const manager = ref(null)
</script>
