import {
    distance,
    lineSlice,
    lineString,
    nearestPointOnLine,
    point,
    simplify,
    length,
} from "@turf/turf";
import maplibregl from "maplibre-gl";
import { getAngleDiff, getBearing } from "~/assets/utils/geographicMath";
import { AppSettings } from "~~/shared/variables/appSettings";

export const useRouteController = (
    map: Ref<maplibregl.Map | null>,
    adjacency: Map<number, { to: number; weight: number; r: number }[]>,
    nodeCoords: Map<number, [number, number]>
) => {
    const currentRoutePath = shallowRef<[number, number][] | null>(null);
    const destinationName = ref<string>("");
    const routeDistance = ref<string>("");
    const routeEta = ref<string>("");
    const endMarker = ref<maplibregl.Marker | null>(null);
    const startNodeId = ref<number | null>(null);
    const endNodeId = ref<number | null>(null);
    const lastMathPos = ref<[number, number] | null>(null);

    const { calculateRoute, mergeClosePoints } = useRouting();
    const { getGameLocationName, calculateGameRouteDetails } = useCityData();
    const { getClosestNodes } = useGraphSystem();

    function findBestStartConfiguration(
        truckCoords: [number, number],
        truckHeading: number,
        searchRadius: number = 5
    ) {
        const truckPt = point(truckCoords);

        // Try to find a road first
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
                const dist = snapped.properties.dist;

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
    function findFlexibleRoute(
        startNodeId: number,
        targetCoords: [number, number],
        truckHeading: number,
        startType: "road" | "yard"
    ) {
        const SEARCH_RADII = [5, 30, 60, 150];

        for (const radius of SEARCH_RADII) {
            const candidates = getClosestNodes(targetCoords, radius, 0.05);

            if (candidates.length === 0) continue;

            const targetSet = new Set<number>(candidates);

            const result = calculateRoute(
                startNodeId,
                targetSet,
                truckHeading,
                adjacency,
                nodeCoords,
                startType,
                targetCoords
            );

            if (result) {
                return result;
            }
        }

        return null;
    }

    // Merges close nodes and cleans them up for smoother route visualisation
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

    function handleRouteClick(
        clickCoords: [number, number],
        truckCoords: [number, number],
        truckHeading: number
    ) {
        if (adjacency.size === 0) return;

        const startConfig = findBestStartConfiguration(
            truckCoords,
            truckHeading,
            10
        );

        if (!startConfig) {
            console.warn("Could not find a valid road matching truck heading.");
            return;
        }

        startNodeId.value = startConfig.toId;
        console.log(clickCoords);

        const clickPt = point(clickCoords);
        const endCandidates = getClosestNodes(clickCoords, 10, 0.1);
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

        const result = findFlexibleRoute(
            startNodeId.value!,
            clickCoords,
            truckHeading,
            startConfig.type as "road" | "yard"
        );

        if (result) {
            if (endMarker.value) endMarker.value.remove();
            endNodeId.value = result.endId;
            const stitchedPath = [startConfig.projectedCoords, ...result.path];
            currentRoutePath.value = stitchedPath;

            drawRouteOnMap(stitchedPath);
            addDestinationMarker(result.endId);

            const details = calculateGameRouteDetails(stitchedPath);
            routeDistance.value = `${details.km} km`;
            routeEta.value = details.time;
            destinationName.value = getGameLocationName(
                clickCoords[0],
                clickCoords[1]
            );
        }
    }

    const updateRouteProgress = (truckCoords: [number, number]) => {
        if (!currentRoutePath.value || currentRoutePath.value.length < 2)
            return;

        if (lastMathPos.value) {
            const d = distance(point(lastMathPos.value), point(truckCoords), {
                units: "kilometers",
            });
            if (d < 0.01) return;
        }
        lastMathPos.value = truckCoords;

        try {
            const routeLine = lineString(currentRoutePath.value);
            const truckPt = point(truckCoords);
            const snapped = nearestPointOnLine(routeLine, truckPt);

            const lastPoint =
                currentRoutePath.value[currentRoutePath.value.length - 1];
            const remainingSection = lineSlice(
                snapped,
                point(lastPoint!),
                routeLine
            );

            const distKm = length(remainingSection, { units: "kilometers" });

            if (distKm < 1) {
                clearRouteState();
                return;
            }

            routeDistance.value = `${distKm.toFixed(0)} km`;

            // TODO: More accurate avgSpeed
            const avgSpeed = 70;
            const hours = distKm / avgSpeed;

            const mins = Math.round(hours * 60);
            routeEta.value = `${Math.floor(mins / 60)}h ${mins % 60}m`;
        } catch (e) {
            console.error(e);
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

        endNodeId.value = null;
        currentRoutePath.value = null;
    }

    return {
        destinationName,
        routeDistance,
        routeEta,
        endMarker,
        currentRoutePath,
        setupRouteLayer,
        handleRouteClick,
        updateRouteProgress,
        clearRouteState,
    };
};
