<script lang="ts" setup>
defineProps<{ onClick: () => void; iconName: string }>();
</script>

<template>
    <button class="option-btn" @click.prevent="onClick">
        <Icon :name="iconName" size="28" />
    </button>
</template>

<style lang="scss" scoped src="~/assets/scss/scoped/hudButton.scss"></style>
