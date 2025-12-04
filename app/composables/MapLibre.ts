import type { Map as MapLibreGl, StyleSpecification } from "maplibre-gl";
import { AppSettings } from "../../shared/variables/appSettings";

export async function initializeMap(
    container: HTMLElement
): Promise<MapLibreGl> {
    const appTheme = AppSettings.theme;

    const maplibregl = (await import("maplibre-gl")).default;
    const { Protocol, PMTiles } = await import("pmtiles");

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const PMTILES_URL = "/map-data/tiles/roads.pmtiles";
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
        zoom: 6,
        minZoom: 5,
        maxZoom: 11.5,
        maxPitch: 40,
        localIdeographFontFamily: "Quicksand",
    });

    map.on("load", async () => {
        ////
        //// ADDING SOURCES
        //// TO LATER DISPLAY THEM
        ////
        // ADDING WATER BORDERS
        map.addSource("ets2-water", {
            type: "geojson",
            data: "map-data/ets2-water.geojson",
        });

        // FOOTPRINTS (BUILDINGS SHAPE)
        map.addSource("ets2-footprints", {
            type: "vector",
            url: "pmtiles://map-data/tiles/ets2-footprints.pmtiles",
        });

        // VILLAGE LABELS
        map.addSource("ets2-villages", {
            type: "geojson",
            data: "map-data/ets2-villages.geojson",
        });

        // CITI NAMES
        map.addSource("ets2-cities", {
            type: "geojson",
            data: "/map-data/ets2-cities.geojson",
        });

        // MAP AREAS
        map.addSource("ets2-mapareas", {
            type: "geojson",
            data: "/map-data/ets2-mapareas.geojson",
        });

        // COUNTRY DELIMITATION
        map.addSource("country-borders", {
            type: "geojson",
            data: "map-data/ets2-countries.geojson",
        });

        ////
        //// LAYERS FOR DISPLAYING
        //// FROM SOURCES
        ////
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

        // THICK ROADS
        map.addLayer({
            id: "ets2-roads",
            type: "line",
            source: "ets2",
            "source-layer": "ets2",
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
            paint: {
                "line-color": "#4a5f7a",
                "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    //
                    5,
                    0.5,
                    //
                    8,
                    3,
                    //
                    9,
                    6,
                    //
                    9.3,
                    6,
                    //
                    9.5,
                    6,
                    //
                    9.6,
                    6,
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
                    11,
                    15,
                    //
                    11.5,
                    19,
                    //
                ],
                "line-opacity": 1,
            },
        });

        // POLYGONS FOR PARKING ETC
        map.addLayer(
            {
                id: "maparea-zones",
                type: "fill",
                source: "ets2-mapareas",
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

        // DISPLAYING BUILDINGS
        map.addLayer(
            {
                id: "footprints-fill",
                type: "fill",
                source: "ets2-footprints",
                "source-layer": "footprints",
                paint: {
                    "fill-color": "#263444",
                    // Interpolate Opacity based on Zoom
                    "fill-opacity": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        6,
                        0.0,
                        9,
                        0.5,
                        10,
                        0.9,
                    ],
                },
            },
            "ets2-lines"
        );

        // DISPLAYING VILLAGE NAMES
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
            minzoom: 7.9,
        });

        // DISPLAYING CITY NAMES
        map.addLayer({
            id: "city-labels",
            type: "symbol",
            source: "ets2-cities",
            layout: {
                "text-field": ["get", "name"],
                "text-font": ["Quicksand"],
                "text-size": 15,
                "text-anchor": "bottom",
                "text-offset": [0, -0.3],
            },
            paint: {
                "text-color": "#ffffff",

                "text-halo-color": "#ffffff",
                "text-halo-width": 0.3,
            },
            minzoom: 5.5,
        });

        // DISPLAYING CITY DOTS
        map.addLayer(
            {
                id: "city-points",
                type: "circle",
                source: "ets2-cities",
                minzoom: 5.5,
                maxzoom: 6.7,
                paint: {
                    "circle-color": appTheme.defaultColor,

                    "circle-radius": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        5,
                        4, // Smaller at low zoom
                        10,
                        7, // Larger at high zoom
                    ],

                    "circle-stroke-width": 1,
                    "circle-stroke-color": "#222",
                },
            },
            "city-labels"
        );

        // DISPLAYING CAPITAL NAMES
        map.addLayer({
            id: "capital-major-labels",
            type: "symbol",
            filter: ["==", ["get", "capital"], 2],
            source: "ets2-cities",
            layout: {
                "text-field": ["get", "name"],
                "text-size": 18,
                "text-font": ["Quicksand"],
                "text-anchor": "bottom",
                "text-offset": [0, -0.3],
            },
            paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#ffffff",
                "text-halo-width": 0.5,
            },
            minzoom: 5,
        });

        // DISPLAYING CAPITAL DOTS
        map.addLayer({
            id: "capital-points",
            type: "circle",
            source: "ets2-cities",
            minzoom: 5,
            filter: ["==", ["get", "capital"], 2], // Only Capitals
            paint: {
                "circle-color": appTheme.defaultColor,
                "circle-radius": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    5,
                    4, // Make capitals slightly bigger?
                    10,
                    8,
                ],
                "circle-stroke-width": 1,
                "circle-stroke-color": "#000000",
                "circle-opacity": 0.9,
            },
        });

        // DISPLAYING COUNTRY DELIMITATIONS
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

        map.addControl(new maplibregl.NavigationControl());
        map.addControl(new maplibregl.FullscreenControl());
    });

    return map;
}
