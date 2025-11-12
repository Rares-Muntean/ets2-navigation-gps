<script lang="ts" setup>
import * as Variables from "~~/shared/variables";

const nuxtApp = useNuxtApp();

onMounted(() => {
    const map = nuxtApp.$leaflet.map("map", {
        crs: nuxtApp.$leaflet.CRS.Simple,
        minZoom: 3,
        maxZoom: Variables.TILESET_MAX_ZOOM,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
    });

    const westSouth = map.unproject(
        [0, Variables.SOUTH_PIXELS],
        Variables.TILESET_MAX_ZOOM
    );
    const eastNorth = map.unproject(
        [Variables.EAST_PIXELS, 0],
        Variables.TILESET_MAX_ZOOM
    );

    map.setView([-128, 128], 0);
    map.setMaxBounds(
        nuxtApp.$leaflet.latLngBounds(westSouth, eastNorth).pad(0.2)
    );
    map.options.maxBoundsViscosity = 0.8;

    nuxtApp.$leaflet
        .tileLayer("./Tiles/{z}/{x}/{y}.png", {
            tileSize: Variables.TILE_SIZE,
            noWrap: true,
            tms: true,
            maxNativeZoom: Variables.TILESET_MAX_ZOOM,
            maxZoom: Variables.TILESET_MAX_ZOOM,
            bounds: nuxtApp.$leaflet.latLngBounds(westSouth, eastNorth),
        })
        .addTo(map);
});
</script>

<template>
    <div id="map"></div>
</template>

<style scoped lang="scss">
@use "~/assets/scss/scoped/map";
</style>
