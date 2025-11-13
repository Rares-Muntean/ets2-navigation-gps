<script lang="ts" setup>
import type { GeojsonData } from "~~/shared/types/GeoJsonTypes/GeojsonData";

let startMarker: L.Marker | null = null;
let endMarker: L.Marker | null = null;
let startKey: string | null = null;
let endKey: string | null = null;
let currentRoute: L.Polyline | null = null;

onMounted(async () => {
    const L = (await import("leaflet")).default;
    const { map, initMap } = useMap();

    initMap("map");

    const res = await fetch("/roadnetwork.geojson");
    const data: GeojsonData = await res.json();
    const graph = new Graph();
    graph.buildGraph(data);
    if (!map.value) return;
    map.value.on("click", (e: L.LeafletMouseEvent) => {
        const clickedKey: string | null = graph.snapToGraph(
            e.latlng.lat,
            e.latlng.lng
        );
        if (!clickedKey) return;

        const node = graph.getNode(clickedKey);
        if (!node) return;
        if (!startMarker) {
            startMarker = L.marker([node.lat, node.lng]).addTo(map.value!);
            startKey = clickedKey;
        } else if (!endMarker) {
            endMarker = L.marker([node.lat, node.lng]).addTo(map.value!);
            endKey = clickedKey;
        } else {
            if (currentRoute) map.value?.removeLayer(currentRoute);
            map.value?.removeLayer(startMarker);
            map.value?.removeLayer(endMarker);
            startMarker = null;
            endMarker = null;
            startKey = null;
            endKey = null;
            currentRoute = null;
        }
        if (startKey && endKey) {
            const routeCoords: [number, number][] = graph.dijkstra(
                startKey,
                endKey
            );
            currentRoute = L.polyline(routeCoords, {
                color: "cyan",
                weight: 3,
            }).addTo(map.value!);
        }
    });
});
</script>

<template>
    <div id="map"></div>
</template>

<style scoped lang="scss">
@use "~/assets/scss/scoped/map";
</style>
