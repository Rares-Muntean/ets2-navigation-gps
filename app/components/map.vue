<script lang="ts" setup>
import { ref, onMounted, shallowRef, Transition } from "vue";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import type TruckMarker from "./truckMarker.vue";
import SpeedLimit from "./speedLimit.vue";

// MAP STATE
const mapEl = ref<HTMLElement | null>(null);
const wrapperEl = ref<HTMLElement | null>(null);
const map = shallowRef<maplibregl.Map | null>(null);

// UI STATE
const isSheetExpanded = ref(false);
const isSheetHidden = ref(false);

// TRUCK STATE
const truckMarkerComponent = ref<InstanceType<typeof TruckMarker> | null>(null);

//// COMPOSABLES
// Telemetry Data
const {
    startTelemetry,
    gameTime,
    gameConnected,
    truckCoords,
    truckSpeed,
    speedLimit,
    truckHeading,
    fuel,
    restStoptime,
    restStopMinutes,
} = useEtsTelemetry();

// Map Areas Data
const { loadLocationData } = useCityData();

// Graph manipulation
const { loading, progress, adjacency, nodeCoords, initializeGraphData } =
    useGraphSystem();

const {
    truckMarker,
    setupTruckMarker,
    updateTruckMarkerPosition,
    removeMarker,
} = useTruckMarker(map);

const {
    isCameraLocked,
    initCameraListeners,
    followTruck,
    startNavigationMode,
    lockCamera,
} = useMapCamera(map);

const {
    setupRouteLayer,
    handleRouteClick,
    updateRouteProgress,
    clearRouteState,
    destinationName,
    routeDistance,
    routeEta,
    endMarker,
    isCalculating,
    initWorkerData,
} = useRouteController(map, adjacency, nodeCoords);

watch([loading, gameConnected], ([isLoading, isGameConnected]) => {
    if (!isLoading) {
        setTimeout(() => {
            isCameraLocked.value = true;
        }, 100);

        if (isGameConnected) {
            if (!truckMarkerComponent.value) return;
            const truckEl = truckMarkerComponent.value.markerElement!;
            setupTruckMarker(truckEl);

            setTimeout(() => {
                isCameraLocked.value = true;
            }, 500);
        } else {
            removeMarker();
        }
    }
});

onMounted(async () => {
    await loadLocationData();
    if (!mapEl.value) return;

    try {
        map.value = await initializeMap(mapEl.value);
        if (!map.value) return;

        map.value.addControl(
            new maplibregl.FullscreenControl({
                container: wrapperEl.value!,
            })
        );

        map.value.on("load", async () => {
            const { nodes, edges } = await initializeGraphData();
            initWorkerData(nodes, edges);

            setupRouteLayer();
            initCameraListeners();
        });

        map.value.on("click", async (e) => {
            if (!truckMarker.value) return;

            await handleRouteClick(
                [e.lngLat.lng, e.lngLat.lat],
                [
                    truckMarker.value.getLngLat().lng,
                    truckMarker.value.getLngLat().lat,
                ],
                truckHeading.value
            );
        });

        startTelemetry(() => {
            telemetryClick();
        });
    } catch (e) {
        console.error(e);
    }
});

function telemetryClick() {
    if (!truckCoords.value) return;

    updateTruckMarkerPosition(truckCoords.value, truckHeading.value);

    followTruck(truckCoords.value, truckHeading.value);

    if (endMarker.value) {
        updateRouteProgress(truckCoords.value);
    }
}

function onStartNavigation() {
    if (!truckMarker.value) return;

    startNavigationMode(
        [truckMarker.value.getLngLat().lng, truckMarker.value.getLngLat().lat],
        truckHeading.value
    );

    isSheetExpanded.value = false;
    isSheetHidden.value = true;
}

function onSheetClosed() {
    isSheetHidden.value = false;
    isSheetExpanded.value = false;
}
</script>

<template>
    <div ref="wrapperEl" class="full-page-wrapper">
        <div ref="mapEl" class="map-container"></div>

        <TopBar
            :fuel="fuel"
            :game-connected="gameConnected"
            :game-time="gameTime"
            :rest-stop-minutes="restStopMinutes"
            :rest-stop-time="restStoptime"
            :truck-speed="truckSpeed"
        />

        <Transition name="fade">
            <LoadingScreen v-if="loading" :progress="progress" />
        </Transition>

        <HudButton icon-name="fe:target" :lock-camera="lockCamera" />

        <SpeedLimit
            :class="{
                'pos-default': !endMarker || isSheetHidden,
                'pos-expanded': isSheetExpanded && endMarker,
                'pos-collapsed':
                    !isSheetExpanded && endMarker && !isSheetHidden,
            }"
            :truck-speed="truckSpeed"
            :speed-limit="speedLimit"
        />

        <Transition name="sheet-slide" @after-leave="onSheetClosed">
            <SheetSlide
                v-if="endMarker"
                :clear-route-state="clearRouteState"
                :on-start-navigation="onStartNavigation"
                :destination-name="destinationName"
                v-model:is-sheet-expanded="isSheetExpanded"
                v-model:is-sheet-hidden="isSheetHidden"
                :route-distance="routeDistance"
                :route-eta="routeEta"
                :speed-limit="speedLimit"
                :truck-speed="truckSpeed"
            />
        </Transition>

        <TruckMarker ref="truckMarkerComponent" />
    </div>
</template>

<style scoped lang="scss">
@use "/assets/scss/scoped/map.scss";
</style>
