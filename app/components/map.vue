<script lang="ts" setup>
const { initMap } = useMap();

onMounted(() => {
    initMap("map");
});
</script>

<template>
    <div id="map"></div>
</template>

<style scoped lang="scss">
@use "~/assets/scss/scoped/map";
</style>
