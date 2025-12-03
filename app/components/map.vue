<script lang="ts" setup>
import { ref, onMounted, shallowRef } from "vue";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl"; // Ensure this is imported for Types/Markers
import { haversine } from "~/assets/utils/helpers";
import { loadGraph } from "~/assets/utils/clientGraph";
import RBush from "rbush";
import { AppSettings } from "~~/shared/variables/appSettings";
import { distance, lineString, point, simplify } from "@turf/turf";

//// INTERFACE FOR RBUSH
interface NodeIndexItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    id: number;
    coord: [number, number];
}

const mapEl = ref<HTMLElement | null>(null);
const map = shallowRef<maplibregl.Map | null>(null);

const loading = ref(false);

//// ROUTING STATE
const startNodeId = ref<number | null>(null);
const endNodeId = ref<number | null>(null);
const startMarker = ref<maplibregl.Marker | null>(null);
const endMarker = ref<maplibregl.Marker | null>(null);

//// We use this to find noted in a specific area
const nodeTree = new RBush<NodeIndexItem>();

//// GRAPH DATA
const adjacency = new Map<
    number,
    { to: number; weight: number; roadType: string }[]
>();
const nodeCoords = new Map<number, [number, number]>();
const currentZoom = ref(0);

onMounted(async () => {
    if (!mapEl.value) return;

    try {
        map.value = await initializeMap(mapEl.value);
        if (!map.value) return;

        currentZoom.value = map.value.getZoom();

        map.value.on("zoom", () => {
            if (map.value) {
                currentZoom.value = map.value.getZoom();
            }
        });

        map.value.on("load", visualizeGraph);
        map.value.on("click", handleMapClick);
    } catch (e) {
        console.error(e);
    }
});

//// HANDLE CLICKS
function handleMapClick(e: maplibregl.MapMouseEvent) {
    if (adjacency.size === 0) return;

    const clickedCoords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    console.log(clickedCoords);

    const candidates = getClosestNodes(clickedCoords, 5);

    if (candidates.length === null) {
        console.warn("No nodes found.");
        return;
    }

    if (startNodeId.value === null) {
        const nodeId = candidates[0]!;
        startNodeId.value = nodeId;

        const nodeLoc = nodeCoords.get(nodeId);

        if (startMarker.value) startMarker.value.remove();
        if (endMarker.value) endMarker.value.remove();
        endNodeId.value = null;
        clearRouteLayer();

        startMarker.value = new maplibregl.Marker({ color: "#00FF00" })
            .setLngLat(nodeLoc as [number, number])
            .addTo(map.value!);
    } else {
        const candidateSet = new Set(candidates);

        if (endMarker.value) endMarker.value.remove();

        const result = calculateRoute(startNodeId.value, candidateSet);

        if (result) {
            endNodeId.value = result.endId; // This is the snapped ID
            const endLoc = nodeCoords.get(result.endId);

            endMarker.value = new maplibregl.Marker({ color: "#FF0000" })
                .setLngLat(endLoc as [number, number])
                .addTo(map.value!);

            drawRoute(result.path);

            startNodeId.value = null;
        } else {
            console.warn("Could not find a path to any nearby node");
        }
    }
}

function getClosestNodes(target: [number, number], limit = 5): number[] {
    const radius = 0.3;

    const candidates = nodeTree.search({
        minX: target[0] - radius,
        minY: target[1] - radius,
        maxX: target[0] + radius,
        maxY: target[1] + radius,
    });

    const sorted = candidates
        .map((item) => ({
            id: item.id,
            dist: haversine(target, item.coord),
        }))
        .sort((a, b) => a.dist - b.dist); // Closest first

    return sorted.slice(0, limit).map((c) => c.id);
}

//// CALCULATIONS FOR DIJKSTRA ALGORITHM
function toRad(deg: number) {
    return (deg * Math.PI) / 180;
}

function toDeg(rad: number) {
    return (rad * 180) / Math.PI;
}

function getBearing(start: [number, number], end: [number, number]) {
    const startLat = toRad(start[1]);
    const startLng = toRad(start[0]);
    const endLat = toRad(end[1]);
    const endLng = toRad(end[0]);
    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x =
        Math.cos(startLat) * Math.sin(endLat) -
        Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
    const brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
}

function getSignedAngle(
    p1: [number, number],
    p2: [number, number],
    p3: [number, number]
) {
    const b1 = getBearing(p1, p2);
    const b2 = getBearing(p2, p3);
    let diff = b2 - b1;
    while (diff <= -180) diff += 360;
    while (diff > 180) diff -= 360;
    return diff;
}

//// DIJKSTRA ALGORITHM + COST
function calculateRoute(
    start: number,
    possibleEnds: Set<number>
): { path: [number, number][]; endId: number } | null {
    const costs = new Map<number, number>();
    const previous = new Map<number, number>();
    const pq = new Set<number>();

    costs.set(start, 0);
    pq.add(start);

    let foundEndId: number | null = null;

    while (pq.size > 0) {
        let currentId: number | null = null;
        let lowestCost = Infinity;

        for (const id of pq) {
            const c = costs.get(id) ?? Infinity;
            if (c < lowestCost) {
                lowestCost = c;
                currentId = id;
            }
        }

        if (currentId === null) break;
        if (possibleEnds.has(currentId)) {
            foundEndId = currentId;
            break;
        }

        pq.delete(currentId);

        const neighbors = adjacency.get(currentId) || [];
        const currentCoord = nodeCoords.get(currentId);
        const prevId = previous.get(currentId);
        const prevCoord = prevId !== undefined ? nodeCoords.get(prevId) : null;

        for (const edge of neighbors) {
            const neighborId = edge.to;

            let stepCost = edge.weight || 1;
            const neighborCoord = nodeCoords.get(neighborId);

            if (prevCoord && currentCoord && neighborCoord) {
                const angle = getSignedAngle(
                    prevCoord,
                    currentCoord,
                    neighborCoord
                );
                const absAngle = Math.abs(angle);

                //// 1.MANUAL ROUNDABOUT
                if (edge.roadType === "roundabout") {
                    stepCost *= 0.5;

                    if (angle < -100) {
                        stepCost += 10000;
                    }
                }

                //// 2. GLOBAL SAFETY
                if (absAngle > 115) {
                    stepCost += 1000000.0;
                }

                //// 3. WRONG WAY SHORTCUTS
                else if (angle < -100) {
                    stepCost += 1000.0;
                }

                //// 4. HIGHWAY FLOW
                else if (absAngle < 20) {
                    stepCost *= 0.9;
                }

                //// 5. STANDARD TURNS
                else {
                    stepCost += 0.05;
                }
            }

            if (stepCost < 1) stepCost = 1;
            const newTotalCost = lowestCost + stepCost;
            const oldCost = costs.get(neighborId) ?? Infinity;

            if (newTotalCost < oldCost) {
                costs.set(neighborId, newTotalCost);
                previous.set(neighborId, currentId);
                pq.add(neighborId);
            }
        }
    }

    if (
        foundEndId === null ||
        (!previous.has(foundEndId) && start !== foundEndId)
    )
        return null;

    const path: [number, number][] = [];

    let curr: number | undefined = foundEndId;

    while (curr !== undefined) {
        const coord = nodeCoords.get(curr);
        if (coord) path.unshift(coord);
        curr = previous.get(curr);
    }

    return { path, endId: foundEndId };
}

// REMOVING ZIG ZAG LINES
function mergeClosePoints(
    coords: [number, number][],
    minDistanceMeters: number = 5
): [number, number][] {
    if (coords.length < 2) return coords;

    const result: [number, number][] = [];
    let i = 0;

    while (i < coords.length) {
        const current = coords[i]!;
        if (i === coords.length - 1) {
            result.push(current);
            break;
        }

        const next = coords[i + 1]!;

        const dist = distance(point(current), point(next), { units: "meters" });

        if (dist < minDistanceMeters) {
            const midPoint: [number, number] = [
                (current[0] + next[0]) / 2,
                (current[1] + next[1]) / 2,
            ];
            result.push(midPoint);

            i += 2;
        } else {
            result.push(current);
            i++;
        }
    }

    if (result.length < 2) {
        result.push(coords[coords.length - 1]!);
    }

    return result;
}

//// DRAWING THE ROUTE
function drawRoute(coords: [number, number][]) {
    if (!map.value) return;

    let cleanCoords = mergeClosePoints(coords, 600);

    const line = lineString(cleanCoords);

    const simplifiedLine = simplify(line, {
        tolerance: 0.0005,
        highQuality: true,
    });

    // STEP 4: Draw
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

//// CLEARS CURRENT ROUTE ON CLICKING AFTER SUCCESSFUL ROUTE
function clearRouteLayer() {
    if (!map.value) return;
    const source = map.value.getSource(
        "debug-route"
    ) as maplibregl.GeoJSONSource;
    if (source) {
        source.setData({ type: "FeatureCollection", features: [] });
    }
}

//// NODE INDEX FOR BBOX RBUSH TREE (fasteer search)
function buildNodeIndex(nodes: { id: number; lng: number; lat: number }[]) {
    const items: NodeIndexItem[] = nodes.map((n) => ({
        minX: n.lng,
        minY: n.lat,
        maxX: n.lng,
        maxY: n.lat,
        id: n.id,
        coord: [n.lng, n.lat],
    }));

    nodeTree.load(items);
}

//// LOADING GRAPH (or visualizing)
async function visualizeGraph() {
    if (!map.value) return;
    loading.value = true;

    try {
        //// BUILD NODES
        const { nodes, edges } = await loadGraph();
        adjacency.clear();
        nodeCoords.clear();

        const spatialIndex = new Map<string, number>();
        const idRedirect = new Map<number, number>();
        const uniqueNodes: any[] = [];

        for (const node of nodes) {
            const key = `${node.lat.toFixed(5)},${node.lng.toFixed(5)}`;

            if (spatialIndex.has(key)) {
                const masterId = spatialIndex.get(key)!;
                idRedirect.set(node.id, masterId);
            } else {
                spatialIndex.set(key, node.id);
                idRedirect.set(node.id, node.id);
                nodeCoords.set(node.id, [node.lng, node.lat]);
                adjacency.set(node.id, []);
                uniqueNodes.push(node);
            }
        }

        //// CREATING BBOX FOR NODES (FASTER SEARCH) : nodeTree<RBush>
        buildNodeIndex(uniqueNodes);

        //// BUILD EDGES
        let connectedCount = 0;
        const edgeFeatures: any[] = [];
        for (const edge of edges) {
            const from = idRedirect.get(edge.from);
            const to = idRedirect.get(edge.to);

            if (from === undefined || to === undefined || from === to) continue;

            const start = nodeCoords.get(from);
            const end = nodeCoords.get(to);

            if (start && end) {
                const rType = edge.properties?.roadType || "local";
                adjacency
                    .get(from)
                    ?.push({ to: to, weight: edge.weight, roadType: rType });
                connectedCount++;

                // UNCOMMENT THIS ONLY WHEN DEBUGGING EDGES.
                // edgeFeatures.push({
                //     type: "Feature",
                //     geometry: { type: "LineString", coordinates: [start, end] },
                //     properties: {
                //         weight: edge.weight,
                //         color:
                //             edge.properties?.roadType === "freeway"
                //                 ? "#ff00ff"
                //                 : "#00ff00",
                //     },
                // });
            }
        }

        if (!map.value.getSource("debug-route")) {
            map.value.addSource("debug-route", {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
            });
            map.value.addLayer({
                id: "debug-route-line",
                type: "line",
                source: "debug-route",
                layout: { "line-join": "round", "line-cap": "round" },
                paint: {
                    "line-color": AppSettings.theme.defaultColor,
                    "line-width": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        //
                        10,
                        8,
                        //
                        10.2,
                        9,
                        //
                        10.5,
                        12,
                        //
                        11.5,
                        19.5,
                        //
                    ],
                },
            });
        }

        //// UNCOMMENT THIS ONLY WHEN DEBUGGING EDGES.
        // if (!map.value.getSource("debug-edges")) {
        //     map.value.addSource("debug-edges", {
        //         type: "geojson",
        //         data: { type: "FeatureCollection", features: edgeFeatures },
        //     });
        //     map.value.addLayer({
        //         id: "debug-edges-lines",
        //         type: "line",
        //         source: "debug-edges",
        //         layout: { "line-join": "round", "line-cap": "round" },
        //         paint: {
        //             "line-color": ["get", "color"],
        //             "line-width": 1.5,
        //             "line-opacity": 0.4,
        //         },
        //     });
        //     if (!map.value.getLayer("debug-edges-arrows")) {
        //         map.value.addLayer({
        //             id: "debug-edges-arrows",
        //             type: "symbol",
        //             source: "debug-edges",
        //             minzoom: 9,
        //             layout: {
        //                 "symbol-placement": "line",
        //                 "symbol-spacing": 50,
        //                 "text-field": "▶",
        //                 "text-size": 18,
        //                 "text-keep-upright": false,
        //                 "text-allow-overlap": true,
        //             },
        //             paint: {
        //                 "text-color": "#ffffff",
        //                 "text-halo-color": "#000000",
        //                 "text-halo-width": 2,
        //             },
        //         });
        //     }
        // }

        loading.value = false;
    } catch (err) {
        console.error("Error loading graph:", err);
    }
}
</script>

<template>
    <div ref="mapEl" class="map-container"></div>
    <div class="zoom-display">Z: {{ currentZoom.toFixed(2) }}</div>
    <!-- <div v-else>LODING</div> -->
</template>

<style scoped lang="scss">
@use "/assets/scss/scoped/map.scss";
</style>
