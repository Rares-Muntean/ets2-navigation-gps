<script lang="ts" setup>
const { isElectron, isMobile, isWeb } = usePlatform();
</script>

<template>
    <DesktopIndex v-if="isWeb" />
    <LazyMap v-if="isWeb" />
</template>
