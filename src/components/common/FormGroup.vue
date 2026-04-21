<template>
  <div class="form-group">
    <div v-if="label" class="label-row" :class="{ 'with-extra': $slots['label-extra'] }">
      <label>{{ label }}</label>
      <slot name="label-extra" />
    </div>
    <label v-else-if="$slots.default && label === undefined" />
    <slot />
    <small v-if="hint" class="hint">{{ hint }}</small>
    <small v-if="error" class="error">{{ error }}</small>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' }
})
</script>

<style lang="scss" scoped>
.form-group {
  margin-bottom: $spacing-lg;

  &:last-child {
    margin-bottom: 0;
  }

  label {
    display: block;
    margin-bottom: $spacing-sm;
    font-size: $font-size-sm;
    color: $text-secondary;
    font-weight: $font-weight-medium;
  }

  .label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: $spacing-sm;

    label {
      margin-bottom: 0;
    }
  }

  .hint {
    display: block;
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    color: $text-placeholder;
    line-height: 1.5;
  }

  .error {
    display: block;
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    color: $color-danger;
  }
}
</style>
