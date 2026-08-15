<template>
  <div id="app">
    <MainLayout />
    <Toast />
  </div>
</template>

<script setup>
import MainLayout from './components/layout/MainLayout.vue'
import Toast from './components/common/Toast.vue'
</script>

<style lang="scss">
#app {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>
