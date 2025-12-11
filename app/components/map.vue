<script lang="ts" setup>
import { ref, onMounted, shallowRef, Transition } from "vue";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { AppSettings } from "~~/shared/variables/appSettings";
import { darkenColor, lightenColor } from "~/assets/utils/colors";

// MAP STATE
const mapEl = ref<HTMLElement | null>(null);
const wrapperEl = ref<HTMLElement | null>(null);
const map = shallowRef<maplibregl.Map | null>(null);

// UI STATE
const isSheetExpanded = ref(false);

// TRUCK STATE
const truckEl = ref<HTMLElement | null>(null);

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
    isNavigating,
    initCameraListeners,
    followTruck,
    startNavigationMode,
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
} = useRouteController(map, adjacency, nodeCoords);

watch([loading, gameConnected], ([isLoading, isGameConnected]) => {
    if (!isLoading) {
        setTimeout(() => {
            isCameraLocked.value = true;
        }, 100);

        if (isGameConnected) {
            setupTruckMarker(truckEl.value!);
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
            await initializeGraphData();
            setupRouteLayer();
            initCameraListeners();
        });

        map.value.on("click", (e) => {
            if (!truckMarker.value) return;

            handleRouteClick(
                [e.lngLat.lng, e.lngLat.lat],
                [
                    truckMarker.value.getLngLat().lng,
                    truckMarker.value.getLngLat().lat,
                ],
                truckHeading.value
            );

            if (endMarker.value) isSheetExpanded.value = true;
        });

        startTelemetry(() => {
            if (!truckCoords.value) return;

            updateTruckMarkerPosition(truckCoords.value, truckHeading.value);

            followTruck(truckCoords.value, truckHeading.value);

            if (endMarker.value) {
                updateRouteProgress(truckCoords.value);
            }
        });
    } catch (e) {
        console.error(e);
    }
});

function onStartNavigation() {
    if (!truckMarker.value) return;

    startNavigationMode(
        [truckMarker.value.getLngLat().lng, truckMarker.value.getLngLat().lat],
        truckHeading.value
    );

    isSheetExpanded.value = false;
}

function onToggleSheet() {
    isSheetExpanded.value = !isSheetExpanded.value;
}

const onClearRoute = () => {
    isNavigating.value = false;
    isSheetExpanded.value = false;
    isCameraLocked.value = false;
};

const onCenterTruck = () => {
    isCameraLocked.value = true;
};
</script>

<template>
    <div ref="wrapperEl" class="full-page-wrapper">
        <div ref="mapEl" class="map-container"></div>

        <div class="game-information">
            <div class="truck-info">
                <div class="truck-speed-div">
                    <div class="road-perspective"></div>
                    <p class="truck-speed">{{ truckSpeed }}</p>
                    <p class="km-h">km/h</p>
                </div>
            </div>

            <div v-if="gameConnected" class="gas-sleep-time">
                <div class="gas-sleep">
                    <div class="fuel-amount">
                        <Icon
                            name="bi:fuel-pump-fill"
                            :class="{ 'pulse-red': fuel < 100 }"
                        />
                        <p>{{ fuel }}<span class="liters">l</span></p>
                    </div>

                    <div class="sleep-div">
                        <Icon
                            name="solar:moon-sleep-bold"
                            class="sleep-icon"
                            :class="{ 'pulse-blue': restStopMinutes < 90 }"
                        />
                        <p>{{ restStoptime }}</p>
                    </div>
                </div>

                <p class="game-time">{{ gameTime }}</p>
            </div>

            <div v-else class="disconnected-div">
                <p class="disconnected-message">Game Offline</p>
                <Icon
                    name="streamline-ultimate:link-disconnected-bold"
                    class="disconnected-icon"
                />
            </div>
        </div>

        <Transition name="fade">
            <div v-if="loading" class="loading-screen">
                <div class="progress-text">{{ progress }}%</div>
                <div class="progress-bar-bg">
                    <div
                        class="progress-bar-fill"
                        :style="{ width: progress + '%' }"
                    ></div>
                </div>
                <h2>Loading Route Data...</h2>
            </div>
        </Transition>

        <button class="option-btn center-btn" @click.prevent="onCenterTruck">
            <Icon name="fe:target" size="24" class="target-icon" />
        </button>

        <Transition name="bottom-circle">
            <div
                v-if="speedLimit !== 0 && !endMarker"
                class="speed-limit-circle speed-limit-circle-bottom"
            >
                <Transition name="over-limit">
                    <div
                        v-if="truckSpeed > speedLimit + 5"
                        class="speed-limit-circle-over-limit"
                    >
                        <div class="over-limit">{{ truckSpeed }}</div>
                    </div>
                </Transition>

                <div class="speed-limit">{{ speedLimit }}</div>
            </div>
        </Transition>

        <Transition name="sheet-slide">
            <div
                v-if="endMarker"
                class="bottom-sheet"
                :class="{ 'is-expanded': isSheetExpanded }"
                :style="{
                    '--theme-color': AppSettings.theme.defaultColor,
                }"
            >
                <div
                    v-if="speedLimit !== 0"
                    class="speed-limit-circle speed-limit-circle-sheet"
                >
                    <Transition name="over-limit">
                        <div
                            v-if="truckSpeed > speedLimit + 5"
                            class="speed-limit-circle-over-limit"
                        >
                            <div class="over-limit">{{ truckSpeed }}</div>
                        </div>
                    </Transition>
                    <div class="speed-limit">
                        {{ speedLimit }}
                    </div>
                </div>

                <div class="sheet-header" @click="onToggleSheet">
                    <div class="drag-pill"></div>
                </div>

                <div class="sheet-body">
                    <div class="top-row">
                        <div class="trip-info" @click="onToggleSheet">
                            <h2 class="dest-name">{{ destinationName }}</h2>

                            <div class="mini-stats" v-if="!isSheetExpanded">
                                <span class="eta">{{ routeEta }}</span>
                                <span class="dist">({{ routeDistance }})</span>
                            </div>
                        </div>

                        <button
                            class="cancel-btn nav-btn"
                            @click.stop="clearRouteState"
                        >
                            <Icon
                                name="material-symbols:close-rounded"
                                size="24"
                            />
                        </button>
                    </div>

                    <div class="expanded-content">
                        <div class="separator"></div>

                        <div class="full-stats">
                            <div class="stat-block">
                                <Icon
                                    name="tabler:clock-filled"
                                    size="26"
                                    class="icon-eta"
                                />
                                <div>
                                    <div class="value">{{ routeEta }}</div>
                                    <div class="label">Estimated Time</div>
                                </div>
                            </div>

                            <div class="stat-block">
                                <Icon
                                    name="tabler:ruler-2"
                                    size="26"
                                    class="icon-dist"
                                />
                                <div>
                                    <div class="value">{{ routeDistance }}</div>
                                    <div class="label">Distance</div>
                                </div>
                            </div>
                        </div>

                        <div
                            class="action-buttons"
                            @click.prevent="onStartNavigation"
                        >
                            <button class="start-btn nav-btn">
                                <Icon
                                    name="tabler:navigation-check"
                                    size="24"
                                />
                                <span>Start Navigation</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>

        <div style="display: none">
            <div ref="truckEl" class="truck-marker">
                <svg
                    width="48"
                    height="48"
                    viewBox="0 0 100 100"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style="
                        display: block;
                        filter: drop-shadow(0px 6px 8px rgba(0, 0, 0, 0.3));
                    "
                >
                    <defs>
                        <linearGradient
                            id="two-tone"
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="0%"
                        >
                            <stop
                                offset="50%"
                                :stop-color="
                                    darkenColor(
                                        AppSettings.theme.defaultColor,
                                        0.1
                                    )
                                "
                            />
                            <stop
                                offset="50%"
                                :stop-color="
                                    lightenColor(
                                        AppSettings.theme.defaultColor,
                                        0.23
                                    )
                                "
                            />
                        </linearGradient>
                    </defs>

                    <path
                        d="M50 10 L90 85 L50 70 L10 85 Z"
                        fill="url(#two-tone)"
                        stroke="url(#two-tone)"
                        stroke-width="12"
                        stroke-linejoin="round"
                        paint-order="stroke fill"
                    />
                </svg>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
@use "/assets/scss/scoped/map.scss";
</style>
