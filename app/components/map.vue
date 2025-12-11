<script lang="ts" setup>
import { ref, onMounted, shallowRef, Transition } from "vue";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { AppSettings } from "~~/shared/variables/appSettings";
import {
    lineSlice,
    lineString,
    nearestPointOnLine,
    point,
    simplify,
    length,
    distance,
} from "@turf/turf";
import { darkenColor, lightenColor } from "~/assets/utils/colors";
import { getAngleDiff, getBearing } from "~/assets/utils/geographicMath";
import { convertTelemtryTime } from "~/assets/utils/helpers";

// MAP STATE
const mapEl = ref<HTMLElement | null>(null);
const wrapperEl = ref<HTMLElement | null>(null);
const map = shallowRef<maplibregl.Map | null>(null);
const destinationName = ref<string>("");
const routeDistance = ref<string>("");
const routeEta = ref<string>("");

// UI STATE
const isSheetExpanded = ref(false);

// NAVIGATION STATE
const isNavigating = ref(false);
const isCameraLocked = ref(false);
const currentRoutePath = shallowRef<[number, number][] | null>(null);
const lastMathPos = ref<[number, number] | null>(null);

// GAME STATE
// const stringTime = ref<string>("");

// TRUCK STATE
const truckMarker = shallowRef<maplibregl.Marker | null>(null);
const truckEl = ref<HTMLElement | null>(null);
// const truckHeading = ref(0);

//// ROUTING STATE
const startNodeId = ref<number | null>(null);
const endNodeId = ref<number | null>(null);
const endMarker = ref<maplibregl.Marker | null>(null);
const startNodeType = ref<"road" | "yard">("road");

//// COMPOSABLES
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

const { loadLocationData, getGameLocationName, calculateGameRouteDetails } =
    useCityData();

const {
    loading,
    progress,
    adjacency,
    nodeCoords,
    getClosestNodes,
    initializeGraphData,
} = useGraphSystem();

const { calculateRoute, mergeClosePoints } = useRouting();

watch([loading, gameConnected], ([isLoading, isGameConnected]) => {
    if (!isLoading) {
        setTimeout(() => {
            centerTruck();
        }, 100);

        if (isGameConnected) {
            setupTruckMarker();
            setTimeout(() => {
                centerTruck();
            }, 500);
        } else {
            truckMarker.value?.remove();
            truckMarker.value = null;
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
        });

        map.value.on("click", handleMapClick);

        breakLockEvent();

        startTelemetry(() => {
            updateTruckPosition(truckCoords.value!, truckHeading.value);
        });
    } catch (e) {
        console.error(e);
    }
});

function updateTruckPosition(coords: [number, number], heading: number) {
    if (!truckMarker.value) return;

    truckMarker.value.setLngLat(coords);
    truckMarker.value.setRotation(heading);
    truckHeading.value = heading;

    if (endNodeId.value !== null) {
        let shouldUpdateMath = false;

        if (!lastMathPos.value) {
            shouldUpdateMath = true;
        } else {
            const distFromLastCalc = distance(
                point(lastMathPos.value),
                point(coords),
                { units: "kilometers" }
            );

            if (distFromLastCalc > 0.01) {
                shouldUpdateMath = true;
            }
        }

        if (shouldUpdateMath) {
            updateRouteProgress(coords);
            lastMathPos.value = coords;
        }
    }

    if (isCameraLocked.value && map.value) {
        const currentZoom = map.value.getZoom();
        const currentPitch = map.value.getPitch();

        map.value.easeTo({
            center: coords,
            bearing: isNavigating.value ? heading : 0,
            pitch: currentPitch,
            zoom: currentZoom,
            duration: 300,
            easing: (t) => t,
        });
    }
}

function breakLockEvent() {
    const breakLockEvents = [
        "dragstart",
        "touchstart",
        "wheel",
        "pitchstart",
        "boxzoomstart",
    ];

    breakLockEvents.forEach((event) => {
        map.value?.on(event, () => {
            if (isCameraLocked.value) {
                isCameraLocked.value = false;
            }
        });
    });
}

function handleMapClick(e: maplibregl.MapMouseEvent) {
    if (adjacency.size === 0 || !truckMarker.value) return;

    const truckPos = truckMarker.value.getLngLat();
    const truckCoords: [number, number] = [truckPos.lng, truckPos.lat];

    const startConfig = findBestStartConfiguration(
        truckCoords,
        truckHeading.value,
        10
    );

    startNodeType.value = startConfig!.type as "road" | "yard";

    if (!startConfig) {
        console.warn("Could not find a valid road matching truck heading.");
        return;
    }

    startNodeId.value = startConfig.toId;

    const clickedCoords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    console.log(clickedCoords);
    const clickPt = point(clickedCoords);
    const endCandidates = getClosestNodes(clickedCoords, 10);

    if (endCandidates.length === 0) return;

    let bestEndNode = endCandidates[0];
    let minEndDist = Infinity;

    for (const nodeId of endCandidates) {
        const nPos = nodeCoords.get(nodeId);
        const neighbors = adjacency.get(nodeId);
        if (!nPos || !neighbors) continue;
        for (const edge of neighbors) {
            const neighPos = nodeCoords.get(edge.to);
            if (!neighPos) continue;
            const line = lineString([nPos, neighPos]);
            const snap = nearestPointOnLine(line, clickPt);
            if (
                snap.properties.dist !== undefined &&
                snap.properties.dist < minEndDist
            ) {
                minEndDist = snap.properties.dist;
                const d1 = distance(clickPt, point(nPos));
                const d2 = distance(clickPt, point(neighPos));
                bestEndNode = d1 < d2 ? nodeId : edge.to;
            }
        }
    }

    if (endMarker.value) endMarker.value.remove();

    const result = calculateRoute(
        startNodeId.value,
        new Set([bestEndNode]),
        truckHeading.value,
        adjacency,
        nodeCoords,
        startNodeType.value
    );

    if (result) {
        isSheetExpanded.value = false;
        endNodeId.value = result.endId;

        const stitchedPath = [startConfig.projectedCoords, ...result.path];
        currentRoutePath.value = stitchedPath;

        drawRouteOnMap(stitchedPath);
        addDestinationMarker(result.endId);

        // Update stats
        const details = calculateGameRouteDetails(stitchedPath);
        routeDistance.value = `${details.km} km`;
        routeEta.value = details.time;
        destinationName.value = getGameLocationName(e.lngLat.lng, e.lngLat.lat);
    }
}

function startNavigation() {
    if (!truckMarker.value || !map.value) return;

    isNavigating.value = true;
    isSheetExpanded.value = false;

    map.value.jumpTo({
        center: truckMarker.value.getLngLat(),
        zoom: 10,
        pitch: 45,
        bearing: truckHeading.value,
    });

    isCameraLocked.value = true;
}

function findBestStartConfiguration(
    truckCoords: [number, number],
    truckHeading: number,
    searchRadius: number = 5
) {
    const truckPt = point(truckCoords);

    const roadCandidates = getClosestNodes(truckCoords, searchRadius, 0.03);
    let bestRoadEdge = null;
    let minRoadDist = Infinity;

    for (const nodeId of roadCandidates) {
        const neighbors = adjacency.get(nodeId);
        const nodePos = nodeCoords.get(nodeId);
        if (!neighbors || !nodePos) continue;

        for (const edge of neighbors) {
            const neighborPos = nodeCoords.get(edge.to);
            if (!neighborPos) continue;

            const roadBearing = getBearing(nodePos, neighborPos);
            const angleDiff = getAngleDiff(truckHeading, roadBearing);
            if (angleDiff > 90) continue;

            const roadLine = lineString([nodePos, neighborPos]);
            const snapped = nearestPointOnLine(roadLine, truckPt);
            const dist = snapped.properties.dist; // km

            if (dist !== undefined && dist < 0.02 && dist < minRoadDist) {
                minRoadDist = dist;
                bestRoadEdge = {
                    type: "road",
                    fromId: nodeId,
                    toId: edge.to,
                    projectedCoords: snapped.geometry.coordinates as [
                        number,
                        number
                    ],
                };
            }
        }
    }

    if (bestRoadEdge) return bestRoadEdge;

    const yardCandidates = getClosestNodes(truckCoords, 20, 0.3);

    if (yardCandidates.length === 0) {
        console.warn("No nodes found even with large radius.");
        return null;
    }

    let closestNodeId: number | null = null;
    let minNodeDist = Infinity;

    for (const nodeId of yardCandidates) {
        const nodePos = nodeCoords.get(nodeId);
        if (!nodePos) continue;

        const dist = distance(truckPt, point(nodePos));

        if (dist < minNodeDist) {
            minNodeDist = dist;
            closestNodeId = nodeId;
        }
    }

    if (closestNodeId !== null) {
        const nodePos = nodeCoords.get(closestNodeId)!;
        return {
            type: "yard",
            fromId: closestNodeId,
            toId: closestNodeId,
            projectedCoords: nodePos,
        };
    }

    return null;
}

const updateRouteProgress = (truckCoords: [number, number]) => {
    if (!currentRoutePath.value || currentRoutePath.value.length < 2) return;

    try {
        const routeLine = lineString(currentRoutePath.value);
        const truckPt = point(truckCoords);

        const snapped = nearestPointOnLine(routeLine, truckPt);
        const lastPointIndex = currentRoutePath.value.length - 1;
        const remainingSection = lineSlice(
            snapped,
            point(currentRoutePath.value[lastPointIndex]!),
            routeLine
        );

        const distKm = length(remainingSection, { units: "kilometers" });

        if (distKm < 1) {
            clearRouteState();

            map.value!.easeTo({
                center: truckCoords,
                bearing: 0,
                pitch: 0,
                zoom: map.value?.getZoom(),
                duration: 300,
                easing: (t) => t,
            });
        }

        routeDistance.value = `${distKm.toFixed(0)} km`;

        const hours = distKm / 70;
        const mins = Math.round(hours * 60);
        routeEta.value = `${Math.floor(mins / 60)}h ${mins % 60}m`;
    } catch (e) {}
};

const centerTruck = () => {
    if (!truckMarker.value) return;
    isCameraLocked.value = true;
};

function clearRouteState() {
    if (!map.value) return;
    const source = map.value.getSource(
        "debug-route"
    ) as maplibregl.GeoJSONSource;

    if (source) {
        source.setData({ type: "FeatureCollection", features: [] });
    }

    if (endMarker.value) {
        endMarker.value.remove();
        endMarker.value = null;
    }

    endNodeId.value = null;
    isSheetExpanded.value = false;

    isNavigating.value = false;
    isCameraLocked.value = false;
}

function setupRouteLayer() {
    if (!map.value) return;
    if (map.value.getSource("debug-route")) return;

    map.value.addSource("debug-route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
    });

    map.value.addLayer(
        {
            id: "debug-route-line",
            type: "line",
            source: "debug-route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
                "line-color": "#22d3ee",
                "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    10,
                    8,
                    10.2,
                    9,
                    10.5,
                    12,
                    11.5,
                    19.5,
                ],
            },
        },
        "sprite-locations"
    );
}

function setupTruckMarker() {
    if (truckEl.value && map.value) {
        truckMarker.value = new maplibregl.Marker({
            element: truckEl.value,
            anchor: "center",
            rotationAlignment: "map",
            pitchAlignment: "map",
        })
            .setLngLat([0, 0])
            .addTo(map.value);
    }
}

function drawRouteOnMap(coords: [number, number][]) {
    if (!map.value) return;
    let cleanCoords = mergeClosePoints(coords, 300);
    const line = lineString(cleanCoords);
    const simplifiedLine = simplify(line, {
        tolerance: 0.0005,
        highQuality: true,
    });

    const source = map.value.getSource(
        "debug-route"
    ) as maplibregl.GeoJSONSource;
    if (source) {
        source.setData({
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: simplifiedLine.geometry,
                },
            ],
        });
    }
}

function addDestinationMarker(nodeId: number) {
    const endLocation = nodeCoords.get(nodeId);
    if (!endLocation || !map.value) return;

    const marker = new maplibregl.Marker({
        color: AppSettings.theme.defaultColor,
    })
        .setLngLat(endLocation)
        .addTo(map.value);

    endMarker.value = marker;
    const markerEl = marker.getElement();

    markerEl.style.cursor = "pointer";
    markerEl.classList.add("my-custom-marker");

    markerEl.addEventListener("click", (ev) => {
        ev.stopPropagation();
        clearRouteState();
    });
}

function toggleSheet() {
    isSheetExpanded.value = !isSheetExpanded.value;
}
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

        <button class="option-btn center-btn" @click.prevent="centerTruck">
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

                <div class="sheet-header" @click="toggleSheet">
                    <div class="drag-pill"></div>
                </div>

                <div class="sheet-body">
                    <div class="top-row">
                        <div class="trip-info" @click="toggleSheet">
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
                            @click.prevent="startNavigation"
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
