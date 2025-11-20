import type { Map as MapLibreGl, StyleSpecification } from "maplibre-gl";
import { haversine } from "~/assets/utils/helpers";
import type { Node, Edge, Coord } from "~~/shared/types/geojson/geojson";
import { loadGraph } from "~/assets/utils/clientGraph";

export async function initializeMap(
    container: HTMLElement
): Promise<MapLibreGl> {
    const maplibregl = (await import("maplibre-gl")).default;
    const { Protocol, PMTiles } = await import("pmtiles");

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const PMTILES_URL = "/ets2.pmtiles";
    const pmtiles = new PMTiles(PMTILES_URL);
    protocol.add(pmtiles);

    const style: StyleSpecification = {
        version: 8,

        name: "ETS2 PMTiles (local)",
        sources: {
            ets2: {
                type: "vector",

                url: `pmtiles://${PMTILES_URL}`,
            },
        },

        layers: [
            {
                id: "background",
                type: "background",
                paint: { "background-color": "#272d39" },
            },
            {
                id: "ets2-lines",
                type: "line",
                source: "ets2",
                "source-layer": "ets2",
                paint: {
                    "line-color": "#3d546e",
                    "line-width": 2,
                },
            },
        ],
    };

    const map = new maplibregl.Map({
        container,
        style,
        center: [10, 50],
        zoom: 4,
        minZoom: 5,
        // maxZoom: 11,
    });

    map.on("load", async () => {
        // ADDING WATER BORDERS
        map.addSource("ets2-water", {
            type: "geojson",
            data: "geojson/ets2-water.geojson",
        });

        // OUTLINE
        map.addLayer({
            id: "ets2-water-outline",
            type: "line",
            source: "ets2-water",
            paint: {
                "line-color": "#1e3a5f",
                "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    5,
                    7, // Zoomed out value
                    10,
                    4, // Zoomed in value
                ],
                "line-opacity": 0.6,
            },
        });

        // WATER
        map.addLayer({
            id: "ets2-water",
            type: "fill",
            source: "ets2-water",
            paint: {
                "fill-color": "#24467b",
                "fill-opacity": 0.6,
            },
        });

        // ROAD CASING (dark outline for depth)
        map.addLayer({
            id: "ets2-road-casing",
            type: "line",
            source: "ets2",
            "source-layer": "ets2",
            filter: ["==", ["get", "type"], "road"],
            paint: {
                "line-color": "#1a1f2a",
                "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    5,
                    1,
                    8,
                    3,
                    12,
                    10,
                    16,
                    16,
                ],
                "line-opacity": 0.9,
            },
        });

        // THICK ROADS
        map.addLayer({
            id: "ets2-roads",
            type: "line",
            source: "ets2",
            "source-layer": "ets2",
            filter: ["==", ["get", "type"], "road"],
            paint: {
                "line-color": "#4a5f7a",
                "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    5,
                    0.5, //
                    8,
                    2, //
                    10,
                    7, //
                    14,
                    30, //
                ],
                "line-opacity": 1,
            },
        });

        // POLYGONS FOR PARKING ETC
        map.addLayer(
            {
                id: "maparea-zones",
                type: "fill",
                source: "ets2",
                "source-layer": "ets2",
                filter: ["==", ["get", "type"], "mapArea"],
                paint: {
                    "fill-color": [
                        "match",
                        ["get", "color"],
                        0,
                        "#3d546e",
                        1,
                        "#4a5f7a",
                        2,
                        "#556b7f",
                        3,
                        "#6b7f93",
                        4,
                        "#7d93a7",
                        "#3d546e",
                    ],
                    "fill-opacity": 0.5,
                },
            },
            "ets2-lines"
        );

        // FOOTPRINTS (BUILDINGS AND STUFF)
        map.addSource("ets2-footprints", {
            type: "vector",
            url: "pmtiles://ets2-footprints.pmtiles",
        });

        map.addLayer({
            id: "footprints-fill",
            type: "fill",
            source: "ets2-footprints",
            "source-layer": "footprints",
            paint: {
                "fill-color": "#2e3f52",
                "fill-opacity": 0.4,
            },
        });

        // VILLAGE LABELS
        map.addSource("ets2-villages", {
            type: "geojson",
            data: "/geojson/ets2-villages.geojson",
        });

        map.addLayer({
            id: "village-labels",
            type: "symbol",
            source: "ets2-villages",
            layout: {
                "text-field": ["get", "name"],
                "text-font": ["Quicksand medium"],
                "text-size": 13,
                "text-anchor": "center",
                "text-offset": [0, 0],
            },
            paint: {
                "text-color": "#ffffff",
            },
            minzoom: 7,
        });

        // CITY LABELS
        map.addLayer({
            id: "city-labels",
            type: "symbol",
            source: "ets2",
            "source-layer": "ets2",
            filter: ["==", ["get", "type"], "city"],
            layout: {
                "text-field": ["get", "name"],
                "text-font": ["Quicksand medium"],
                "text-size": 15,
                "text-anchor": "center",
            },
            paint: {
                "text-color": "#ffffff",
            },
            minzoom: 6,
        });

        // CAPITAL POINTS
        map.addLayer({
            id: "capital-major-labels",
            type: "symbol",
            filter: ["==", ["get", "capital"], 2],
            source: "ets2",
            "source-layer": "ets2",
            layout: {
                "text-field": ["get", "name"],
                "text-size": 18,
                "text-font": ["Quicksand medium"],
                "text-anchor": "center",
            },
            paint: {
                "text-color": "#ffffff",
            },
            minzoom: 4,
        });

        // COUNTRY DELIMITATION
        map.addSource("country-borders", {
            type: "geojson",
            data: "geojson/ets2-countries.geojson",
        });

        map.addLayer({
            id: "country-borders",
            type: "line",
            source: "country-borders",
            paint: {
                "line-color": "#3d546e",
                "line-width": 5,
                "line-blur": 2,
                "line-opacity": 0.4,
            },
        });

        // map.addSource("route", {
        //     type: "geojson",
        //     data: { type: "FeatureCollection", features: [] },
        // });

        // map.addLayer({
        //     id: "route-layer",
        //     type: "line",
        //     source: "route",
        //     paint: {
        //         "line-color": "blue",
        //         "line-width": 10,
        //     },
        // });

        map.addControl(new maplibregl.NavigationControl());
        map.addControl(new maplibregl.FullscreenControl());
    });

    return map;
}
