<script lang="ts" setup>
import { ref, onMounted } from "vue";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadGraph } from "~/assets/utils/clientGraph";

const mapEl = ref<HTMLElement | null>(null);
const map = shallowRef<maplibregl.Map | null>(null);

const loading = ref(false);
const status = ref("");

const startNode = ref<number | null>(null);
const adjacency = new Map<number, { to: number; weight: number }[]>();
const nodeCoords = new Map<number, [number, number]>();

// --- INIT ---
onMounted(async () => {
    if (!mapEl.value) return;

    try {
        map.value = await initializeMap(mapEl.value);

        if (!map.value) return;

        if (map.value.loaded()) {
            visualizeGraph();
        } else {
            map.value.on("load", visualizeGraph);
        }
    } catch {}
});

//VIZUALIZE THE GRAPH
async function visualizeGraph() {
    if (!map.value) return;

    loading.value = true;
    status.value = "Downloading Graph Data...";

    try {
        const { nodes, edges } = await loadGraph();

        adjacency.clear();
        nodeCoords.clear();

        status.value = `Stitching ${nodes.length} nodes...`;

        // --- STEP 1: SPATIAL MERGE (THE FIX) ---
        // We map "Lat,Lng" strings to a single "Master ID"
        const spatialIndex = new Map<string, number>();
        const idRedirect = new Map<number, number>(); // Maps Old ID -> Master ID
        const uniqueNodes: any[] = []; // Only keep unique nodes for visuals

        for (const node of nodes) {
            // Round to ~1 meter precision (5 decimals) to snap close points
            const key = `${node.lat.toFixed(5)},${node.lng.toFixed(5)}`;

            if (spatialIndex.has(key)) {
                // DUPLICATE FOUND!
                // This node is in the same spot as a previous one.
                // We will ignore this new ID and point it to the old Master ID.
                const masterId = spatialIndex.get(key)!;
                idRedirect.set(node.id, masterId);
            } else {
                // NEW UNIQUE NODE
                spatialIndex.set(key, node.id);
                idRedirect.set(node.id, node.id); // Maps to itself

                // Store Data
                nodeCoords.set(node.id, [node.lng, node.lat]);
                adjacency.set(node.id, []);
                uniqueNodes.push(node);
            }
        }

        // --- STEP 2: VISUALIZE NODES ---
        const nodeFeatures: any[] = uniqueNodes.map((node) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [node.lng, node.lat] },
            properties: { id: node.id },
        }));

        // --- STEP 3: BUILD EDGES (USING REDIRECTED IDs) ---
        const edgeFeatures: any[] = [];

        for (const edge of edges) {
            // CONVERT IDs: Transform raw IDs to the "Master" IDs
            const u = idRedirect.get(edge.from);
            const v = idRedirect.get(edge.to);

            // Safety check
            if (u === undefined || v === undefined) continue;
            if (u === v) continue; // Don't allow self-loops (tiny errors)

            // Get Coords for Visuals
            const start = nodeCoords.get(u);
            const end = nodeCoords.get(v);

            if (start && end) {
                // LOGIC: Add connection using Master IDs
                adjacency.get(u)?.push({ to: v, weight: edge.weight });
                adjacency.get(v)?.push({ to: u, weight: edge.weight }); // Bi-directional

                // VISUALS
                edgeFeatures.push({
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: [start, end],
                    },
                    properties: {
                        weight: edge.weight,
                        color:
                            edge.properties?.roadType === "freeway"
                                ? "#ff00ff"
                                : "#00ff00",
                    },
                });
            }
        }

        status.value = `Graph Ready. Merged ${
            nodes.length - uniqueNodes.length
        } duplicates.`;

        // --- RENDER ---
        // Route Layer
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
                    "line-color": "#FFD700",
                    "line-width": 6,
                    "line-opacity": 0.8,
                },
            });
        }

        setupRouteClicks();

        // Edges
        map.value.addSource("debug-edges", {
            type: "geojson",
            data: { type: "FeatureCollection", features: edgeFeatures },
        });
        map.value.addLayer({
            id: "debug-edges-lines",
            type: "line",
            source: "debug-edges",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
                "line-color": ["get", "color"],
                "line-width": 1.5,
                "line-opacity": 0.6,
            },
        });

        // Nodes
        map.value.addSource("debug-nodes", {
            type: "geojson",
            data: { type: "FeatureCollection", features: nodeFeatures },
        });
        map.value.addLayer({
            id: "debug-nodes-points",
            type: "circle",
            source: "debug-nodes",
            paint: {
                "circle-radius": 5,
                "circle-color": "#ffffff",
                "circle-opacity": 0.8,
            },
        });

        loading.value = false;
        console.log("Graph stitched and loaded.");
    } catch (err) {
        console.error("Error loading graph:", err);
        status.value = "Error loading data.";
    }
}

function setupRouteClicks() {
    if (!map.value) return;

    // 1. Change cursor to pointer (Hand icon)
    map.value.on("mouseenter", "debug-nodes-points", () => {
        if (map.value) map.value.getCanvas().style.cursor = "pointer";
    });

    // 2. Reset cursor
    map.value.on("mouseleave", "debug-nodes-points", () => {
        if (map.value) map.value.getCanvas().style.cursor = "";
    });

    // 3. Handle Click
    map.value.on("click", "debug-nodes-points", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;

        // Force ID to be a number
        const id = Number(feature.properties?.id);

        console.log("Clicked Node ID:", id); // Check your browser console!

        if (startNode.value === null) {
            // SET START
            startNode.value = id;
            status.value = `Start Node ${id} selected. Click destination.`;

            // Trigger a repaint to show the green dot (if you used the paint logic above)
            map.value?.setPaintProperty("debug-nodes-points", "circle-color", [
                "case",
                ["==", ["get", "id"], id],
                "#00FF00", // Start is Green
                "#ffffff",
            ]);
        } else {
            // SET END & CALCULATE
            status.value = `Calculating path from ${startNode.value} to ${id}...`;
            calculateShortestPath(startNode.value, id);

            // Reset Start
            startNode.value = null;

            // Reset colors
            map.value?.setPaintProperty(
                "debug-nodes-points",
                "circle-color",
                "#ffffff"
            );
        }
    });
}

function calculateShortestPath(startId: number, endId: number) {
    const dist = new Map<number, number>();
    const prev = new Map<number, number>();
    const queue = new Set<number>();

    dist.set(startId, 0);
    queue.add(startId);

    let found = false;

    // Basic Dijkstra
    while (queue.size > 0) {
        // Get node with smallest distance
        let u: number | null = null;
        let minDist = Infinity;
        for (const node of queue) {
            const d = dist.get(node) || Infinity;
            if (d < minDist) {
                minDist = d;
                u = node;
            }
        }

        if (u === null) break;
        queue.delete(u);

        if (u === endId) {
            found = true;
            break;
        }

        const neighbors = adjacency.get(u) || [];
        for (const n of neighbors) {
            const alt = (dist.get(u) || 0) + n.weight;
            if (alt < (dist.get(n.to) || Infinity)) {
                dist.set(n.to, alt);
                prev.set(n.to, u);
                queue.add(n.to);
            }
        }
    }

    if (!found) {
        status.value = "No Route Found (Gap in road?)";
        alert("Road is disconnected!");
        return;
    }

    // Reconstruct Path
    const path: number[][] = [];
    let curr: number | undefined = endId;
    while (curr !== undefined) {
        const c = nodeCoords.get(curr);
        if (c) path.unshift(c);
        curr = prev.get(curr);
    }

    // Draw Line
    (map.value?.getSource("debug-route") as any).setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: path },
        properties: {},
    });

    status.value = `Route Found: ${path.length} nodes`;
}
</script>

<template>
    <div ref="mapEl" class="map-container"></div>
    <div class="legend">
        <div class="item"><span class="color road"></span> Road Graph</div>
        <div class="item">
            <span class="color snap"></span> Auto-Stitch (Gap Fix)
        </div>
        <div class="item"><span class="color route"></span> Route</div>
    </div>
</template>

<style scoped>
.map-container {
    width: 100%;
    height: 100vh;
    background-color: #272d39;
}
</style>
