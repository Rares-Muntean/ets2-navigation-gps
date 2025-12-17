import { distance, lineString, nearestPointOnLine, point } from "@turf/turf";
import maplibregl from "maplibre-gl";
import {
    getBearing,
    getSqDistToSegment,
    DEVIATION_THRESHOLD_SQ,
    getSquaredDist,
} from "~/assets/utils/geographicMath";
import { AppSettings } from "~~/shared/variables/appSettings";

export const useRouteController = (
    map: Ref<maplibregl.Map | null>,
    adjacency: Map<number, { to: number; weight: number; r: number }[]>,
    nodeCoords: Map<number, [number, number]>
) => {
    const { getGameLocationName, getWorkerCityData } = useCityData();
    const { getClosestNodes } = useGraphSystem();

    const currentRoutePath = shallowRef<[number, number][] | null>(null);
    const routeStatsCache = shallowRef<Float32Array | null>(null);

    const destinationName = ref<string>("");
    const routeDistance = ref<string>("");
    const routeEta = ref<string>("");

    const savedDestination = ref<[number, number] | null>(null);

    const endMarker = ref<maplibregl.Marker | null>(null);
    const isRouteActive = ref(false);

    const startNodeId = ref<number | null>(null);
    const endNodeId = ref<number | null>(null);
    const lastMathPos = ref<[number, number] | null>(null);

    const isCalculating = ref(false);
    const routeFound = ref<boolean | null>(null);

    const currentRouteIndex = ref(0);

    let worker: Worker | null = null;

    if (import.meta.client) {
        worker = new Worker(
            new URL("~/assets/workers/route.worker.ts", import.meta.url),
            { type: "module" }
        );

        worker.onmessage = (e) => {
            if (e.data.type === "READY") console.log("Web Worker Ready.");
        };
    }

    function initWorkerData(nodesArray: any[], edgesArray: any[]) {
        if (!worker) return;

        const cityPayload = getWorkerCityData();

        worker.postMessage({
            type: "INIT_GRAPH",
            payload: {
                nodes: nodesArray,
                edges: edgesArray,
                cities: cityPayload,
            },
        });
    }

    function calculateRouteInWorker(
        startId: number,
        possibleEnds: number[],
        heading: number,
        startType: string,
        targetCoords: [number, number],
        projectedStartCoords: [number, number]
    ): Promise<any> {
        return new Promise((resolve) => {
            if (!worker) {
                resolve(null);
                return;
            }

            const handler = (e: MessageEvent) => {
                if (e.data.type === "RESULT") {
                    worker.removeEventListener("message", handler);
                    resolve(e.data.payload);
                }
            };

            worker.addEventListener("message", handler);

            worker.postMessage({
                type: "CALC_ROUTE",
                payload: {
                    startId,
                    possibleEnds,
                    heading,
                    startType,
                    targetCoords,
                    projectedStartCoords,
                },
            });
        });
    }

    function findBestStartConfiguration(
        truckCoords: [number, number],
        truckHeading: number,
        _ignoredLimit: number = 20
    ) {
        const truckPt = point(truckCoords);
        const normalizedTruckHeading = ((truckHeading % 360) + 360) % 360;

        if (adjacency.size === 0 || nodeCoords.size === 0) {
            console.error("CRITICAL: Graph data is empty!");
            return null;
        }

        const nearbyNodes = getClosestNodes(truckCoords, 100, 0.1);

        if (nearbyNodes.length === 0) {
            console.error(
                "CRITICAL: Quadtree returned 0 nodes near truck.",
                truckCoords
            );
            return null;
        }

        let bestEdge = null;
        let minScore = Infinity;

        for (const fromNodeId of nearbyNodes) {
            const neighbors = adjacency.get(fromNodeId);
            const fromPos = nodeCoords.get(fromNodeId);
            if (!neighbors || !fromPos) continue;

            for (const edge of neighbors) {
                const toPos = nodeCoords.get(edge.to);
                if (!toPos) continue;

                let roadBearing = getBearing(fromPos, toPos);
                roadBearing = ((roadBearing % 360) + 360) % 360;

                let diff = Math.abs(normalizedTruckHeading - roadBearing);
                if (diff > 180) diff = 360 - diff;

                const roadLine = lineString([fromPos, toPos]);
                const snapped = nearestPointOnLine(roadLine, truckPt);
                const distKm = snapped.properties.dist;

                if (distKm === undefined) continue;

                const score = distKm + diff * 0.001;

                if (score < minScore) {
                    minScore = score;
                    bestEdge = {
                        type: "road",
                        fromId: fromNodeId,
                        toId: edge.to,
                        projectedCoords: snapped.geometry.coordinates as [
                            number,
                            number
                        ],
                    };
                }
            }
        }

        if (bestEdge) return bestEdge;

        const yardCandidates = getClosestNodes(truckCoords, 20, 0.3);
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
            const nodePos = nodeCoords.get(closestNodeId);
            if (!nodePos) return;

            return {
                type: "yard",
                fromId: closestNodeId,
                toId: closestNodeId,
                projectedCoords: nodePos,
            };
        }

        return null;
    }

    /**
     * Tries to find a route. If it fails, it expands the search radius
     * around the destination and tries again automatically.
     */
    async function findFlexibleRoute(
        startNodeId: number,
        targetCoords: [number, number],
        truckHeading: number,
        startType: "road" | "yard",
        projectedStartCoords: [number, number]
    ) {
        const SEARCH_RADII = [1, 2, 4, 8, 16, 32, 100, 300];

        for (const radius of SEARCH_RADII) {
            const candidates = getClosestNodes(targetCoords, radius, 0.1);

            if (candidates.length === 0) continue;

            const result = await calculateRouteInWorker(
                startNodeId,
                candidates,
                truckHeading,
                startType,
                targetCoords,
                projectedStartCoords
            );

            if (result) {
                return result;
            }
        }

        return null;
    }

    function drawRouteOnMap(coords: [number, number][]) {
        if (!map.value) return;

        const rawMap = toRaw(map.value);

        const source = rawMap.getSource(
            "debug-route"
        ) as maplibregl.GeoJSONSource;

        source.setData({
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "LineString",
                        coordinates: toRaw(coords),
                    },
                },
            ],
        });
    }

    function addDestinationMarker(nodeId: number) {
        const endLocation = nodeCoords.get(nodeId);
        if (!endLocation || !map.value) return;

        const marker = new maplibregl.Marker({
            color: AppSettings.theme.defaultColor,
        })
            .setLngLat(endLocation)
            .addTo(map.value);

        const markerEl = marker.getElement();
        markerEl.style.cursor = "pointer";
        markerEl.classList.add("my-custom-marker");

        markerEl.addEventListener("click", (ev) => {
            ev.stopPropagation();
            clearRouteState();
        });

        endMarker.value = marker;
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

    async function handleRouteClick(
        clickCoords: [number, number],
        truckCoords: [number, number],
        truckHeading: number,
        createEndMarker: boolean
    ) {
        if (adjacency.size === 0 || isCalculating.value) return;

        isCalculating.value = true;
        routeFound.value = null;

        savedDestination.value = clickCoords;

        try {
            const startConfig = findBestStartConfiguration(
                truckCoords,
                truckHeading,
                10
            );

            if (!startConfig) {
                console.warn(
                    "Could not find a valid road matching truck heading."
                );
                return;
            }

            startNodeId.value = startConfig.toId;

            const result = await findFlexibleRoute(
                startNodeId.value!,
                toRaw(clickCoords),
                truckHeading,
                startConfig.type as "road" | "yard",
                startConfig.projectedCoords
            );

            if (result) {
                if (endMarker.value) {
                    endMarker.value.remove();
                    endMarker.value = null;
                }

                isRouteActive.value = true;

                endNodeId.value = result.endId;

                // Safety, it is now immutable.
                const frozenRawPath = Object.freeze(result.rawPath);
                currentRoutePath.value = frozenRawPath as any;

                routeStatsCache.value = result.stats;

                const cache = result.stats;
                const lastIdx = (result.rawPath.length - 1) * 2;
                const totalKm = cache[lastIdx]!;
                const totalHours = cache[lastIdx + 1]!;

                drawRouteOnMap(result.displayPath);
                if (createEndMarker) addDestinationMarker(result.endId);

                routeDistance.value = `${Math.round(totalKm)} km`;
                const h = Math.floor(totalHours);
                const m = Math.round((totalHours - h) * 60);
                routeEta.value = `${h}h ${m}min`;

                destinationName.value = getGameLocationName(
                    clickCoords[0],
                    clickCoords[1]
                );

                routeFound.value = true;
                currentRouteIndex.value = 0;
            } else {
                routeFound.value = false;
            }
        } catch (e) {
            console.log(`Route calculation Failed: ${e}`);
            isRouteActive.value = false;
        } finally {
            isCalculating.value = false;
        }
    }

    const updateRouteProgress = (
        truckCoords: [number, number],
        truckHeading: number
    ) => {
        if (!currentRoutePath.value || currentRoutePath.value.length < 2)
            return;
        const cache = routeStatsCache.value;
        if (!cache) return;

        if (lastMathPos.value) {
            const sqDist = getSquaredDist(lastMathPos.value, truckCoords);
            if (sqDist < 0.000000001) return;
        }
        lastMathPos.value = truckCoords;

        const path = currentRoutePath.value;
        let bestIndex = currentRouteIndex.value;
        let minSqDist = Infinity;

        const searchLimit = Math.min(path.length - 1, bestIndex + 50);
        const startSearch = Math.max(0, bestIndex - 5);

        for (let i = startSearch; i < searchLimit; i++) {
            const distSq = getSqDistToSegment(
                truckCoords,
                path[i]!,
                path[i + 1]!
            );

            if (distSq < minSqDist) {
                minSqDist = distSq;
                bestIndex = i;
            }
        }

        currentRouteIndex.value = bestIndex;

        if (minSqDist > DEVIATION_THRESHOLD_SQ) {
            if (!isCalculating.value && savedDestination.value) {
                console.log("Deviation detected! Recalculating...");
                handleRouteClick(
                    toRaw(savedDestination.value),
                    truckCoords,
                    truckHeading,
                    false // TODO: GET IF ITS A JOB OR NOT (FALSE FOR JOB, TRUE FOR MANUAL ENDMARK)
                );
                return;
            }
        }

        const distToEndSq = getSquaredDist(truckCoords, path[path.length - 1]!);
        if (distToEndSq < 0.00000025) {
            clearRouteState();
            return;
        }

        const lastIdx = (path.length - 1) * 2;
        const currentIdx = bestIndex * 2;

        const totalKm = cache[lastIdx]!;
        const totalHours = cache[lastIdx + 1]!;

        const currentKm = cache[currentIdx]!;
        const currentHours = cache[currentIdx + 1]!;

        const remKm = totalKm - currentKm;
        const remHours = totalHours - currentHours;

        routeDistance.value = `${Math.round(remKm)} km`;

        if (remHours > 0) {
            const h = Math.floor(remHours);
            const m = Math.round((remHours - h) * 60);
            routeEta.value = `${h}h ${m}min`;
        } else {
            routeEta.value = "Arriving...";
        }
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

        isRouteActive.value = false;

        endNodeId.value = null;
        currentRoutePath.value = null;
        savedDestination.value = null;
    }

    return {
        destinationName,
        routeDistance,
        routeEta,
        endMarker,
        isCalculating,
        routeFound,
        currentRoutePath,
        isRouteActive,
        initWorkerData,
        setupRouteLayer,
        handleRouteClick,
        updateRouteProgress,
        clearRouteState,
    };
};
