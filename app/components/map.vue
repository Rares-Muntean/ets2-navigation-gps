<script lang="ts" setup>
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { Map } from "maplibre-gl";
import { ref, onMounted } from "vue";

interface Node {
    id: number;
    lng: number;
    lat: number;
}

interface Edge {
    from: number;
    to: number;
    weight: number;
}

const mapEl = ref<HTMLElement | null>(null);
let map: Map | null = null;

onMounted(async () => {
    if (!mapEl.value) return;

    map = await initializeMap(mapEl.value);

    map.on("load", async () => {
        // Load nodes and edges JSON
        const [nodes, edges]: [Node[], Edge[]] = await Promise.all([
            fetch("/roadnetwork/nodes.json").then((res) => res.json()),
            fetch("/roadnetwork/edges.json").then((res) => res.json()),
        ]);

        // Nodes as GeoJSON Points
        const nodeFeatures: Feature<Point>[] = nodes.map((n) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [n.lng, n.lat] },
            properties: {},
        }));

        const nodesGeoJSON: FeatureCollection<Point> = {
            type: "FeatureCollection",
            features: nodeFeatures,
        };

        // Edges as GeoJSON LineStrings
        const edgeFeatures: Feature<LineString>[] = edges.map((e) => {
            const from = nodes[e.from]!;
            const to = nodes[e.to]!;
            return {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [from.lng, from.lat],
                        [to.lng, to.lat],
                    ],
                },
                properties: {},
            };
        });

        const edgesGeoJSON: FeatureCollection<LineString> = {
            type: "FeatureCollection",
            features: edgeFeatures,
        };

        // Add sources to map
        map?.addSource("graph-nodes", { type: "geojson", data: nodesGeoJSON });
        map?.addSource("graph-edges", { type: "geojson", data: edgesGeoJSON });

        // Render nodes
        map?.addLayer({
            id: "graph-nodes-layer",
            type: "circle",
            source: "graph-nodes",
            paint: {
                "circle-radius": 2,
                "circle-color": "blue",
                "circle-opacity": 0.5,
            },
        });

        // Render edges
        map?.addLayer({
            id: "graph-edges-layer",
            type: "line",
            source: "graph-edges",
            paint: {
                "line-color": "#FF0000",
                "line-width": 1,
                "line-opacity": 0.6,
            },
        });

        map?.moveLayer("graph-edges-layer");

        console.log(
            "Graph rendered:",
            nodes.length,
            "nodes,",
            edges.length,
            "edges"
        );
    });
});
</script>

<template>
    <div ref="mapEl" style="width: 100%; height: 100vh"></div>
</template>
