<template>
  <div id="app">
    <MainLayout />
    <Toast />
    <ConfirmHost />
  </div>
</template>

<script setup>
import MainLayout from './components/layout/MainLayout.vue'
import Toast from './components/common/Toast.vue'
import ConfirmHost from './components/common/ConfirmHost.vue'
</script>

<style lang="scss">
#app {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>
