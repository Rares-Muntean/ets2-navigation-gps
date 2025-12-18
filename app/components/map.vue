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

// JOB STATE
const currentJobKey = ref<string>("");

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
    hasInGameMarker,
    hasActiveJob,
    destinationCity,
    destinationCompany,
} = useEtsTelemetry();

// Map Areas Data
const { loadLocationData, findDestinationCoords } = useCityData();

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
    isCalculating: isCalculatingRoute,
    initWorkerData,
    isRouteActive,
    routeFound,
} = useRouteController(map, adjacency, nodeCoords);

// We check if it has active job, if it has one, plot a route
watch(
    [hasActiveJob, destinationCity, destinationCompany, gameConnected, loading],
    async ([hasJob, city, company, isConnected, isLoading]) => {
        if (isLoading) return;

        if (!isConnected) {
            currentJobKey.value = "";
            return;
        }

        if (
            !truckCoords.value ||
            (truckCoords.value[0] === 0 && truckCoords.value[1] === 0)
        ) {
            return;
        }

        const newJobKey = hasJob ? `${city}|${company}` : "";

        if (uiTimer) clearTimeout(uiTimer);

        uiTimer = setTimeout(async () => {
            if (hasJob && newJobKey !== currentJobKey.value) {
                if (!truckCoords.value) return;

                const destCoords = findDestinationCoords(city, company);

                if (destCoords) {
                    currentJobKey.value = newJobKey;

                    await handleRouteClick(
                        destCoords,
                        truckCoords.value,
                        truckHeading.value,
                        false
                    );
                }
            }
        }, 500);

        if (!hasJob && currentJobKey.value !== "") {
            clearRouteState();
            currentJobKey.value = "";
        }
    }
);

// We set the routeFound back to null with a delay if its true / false.
let uiTimer: ReturnType<typeof setTimeout> | null = null;
watch(routeFound, (newVal) => {
    if (newVal !== null) {
        if (uiTimer) clearTimeout(uiTimer);

        uiTimer = setTimeout(() => {
            routeFound.value = null;
        }, 1000);
    }
});

// When loaded, checks gameConnected -> show map
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
            console.log(
                ` ${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`
            ); // KEEP FOR DEBUGGING BUGGED AREAS
            if (hasActiveJob.value) return;
            if (!truckMarker.value) return;

            await handleRouteClick(
                [e.lngLat.lng, e.lngLat.lat],
                [
                    truckMarker.value.getLngLat().lng,
                    truckMarker.value.getLngLat().lat,
                ],
                truckHeading.value,
                true
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

    if (isRouteActive.value) {
        updateRouteProgress(truckCoords.value, truckHeading.value);
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

        <Transition name="fade">
            <LoadingScreen v-if="loading" :progress="progress" />
        </Transition>

        <TopBar
            :fuel="fuel"
            :game-connected="gameConnected"
            :game-time="gameTime"
            :rest-stop-minutes="restStopMinutes"
            :rest-stop-time="restStoptime"
            :truck-speed="truckSpeed"
        />

        <NotificationRoute
            :is-route-found="routeFound"
            :is-calculating-route="isCalculatingRoute"
        />

        <HudButton icon-name="fe:target" :lock-camera="lockCamera" />

        <SpeedLimit
            :class="{
                'pos-default': !isRouteActive || isSheetHidden,
                'pos-expanded': isSheetExpanded && isRouteActive,
                'pos-collapsed':
                    !isSheetExpanded && isRouteActive && !isSheetHidden,
            }"
            :truck-speed="truckSpeed"
            :speed-limit="speedLimit"
        />

        <div class="warnings">
            <WarningSlide
                :show-if="hasInGameMarker && isRouteActive"
                :reset-on="isRouteActive"
                text="External Route Detected: Set Waypoint"
            />

            <WarningSlide
                :show-if="!gameConnected"
                :reset-on="gameConnected"
                text="Game Offline"
            />
        </div>

        <Transition name="sheet-slide" @after-leave="onSheetClosed">
            <SheetSlide
                v-if="isRouteActive"
                :clear-route-state="clearRouteState"
                :has-active-job="hasActiveJob"
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

        <TruckMarker
            :is-camera-locked="isCameraLocked"
            ref="truckMarkerComponent"
        />
    </div>
</template>

<style scoped lang="scss" src="~/assets/scss/scoped/map.scss"></style>
