import type { Map as MapLibreGl, StyleSpecification } from "maplibre-gl";
import { AppSettings } from "../../shared/variables/appSettings";
import { blendWithBg, lightenColor } from "~/assets/utils/colors";

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

        sprite: window.location.origin + "/sprites/sprites",

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
                filter: ["!=", ["get", "type"], "ferry"],
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
        maxPitch: 45,
        localIdeographFontFamily: "Quicksand",
        attributionControl: false,
        maxBounds: [
            [-22, 25],
            [50, 70],
        ],
    });

    //// =================> LATER ATS UPDATE <=================
    // const map = {
    //     ets: {
    //         container,
    //         style,
    //         center: [10, 50],
    //         zoom: 6,
    //         minZoom: 5,
    //         maxZoom: 11.5,
    //         maxPitch: 45,
    //         localIdeographFontFamily: "Quicksand",
    //         attributionControl: false,
    //         bounds: [
    //             [-22, 25],
    //             [50, 70],
    //         ],
    //     },

    //     ats: {
    //         center: [-98, 39],
    //         bounds: [
    //             [-130, 23], // SW
    //             [-60, 55], // NE
    //         ],
    //         minZoom: 4,
    //         maxZoom: 10.5,
    //     },
    // };

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

        // CITY NAMES
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

        // SPRITE LOCATIONS
        map.addSource("sprite-locations", {
            type: "geojson",
            data: "map-data/ets2-sprite-locations.geojson",
        });

        // PREFAB LOCATIONS
        map.addSource("prefab-locations", {
            type: "geojson",
            data: "map-data/ets2-prefabs.geojson",
        });

        // DISPLAY COUNTRY NAMES
        map.addSource("ets2-countries", {
            type: "geojson",
            data: "map-data/ets2-country-names.geojson",
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
            filter: ["!=", ["get", "type"], "ferry"],
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

        // PREFABS FOR SERVICE AREAS     ETC
        map.addLayer(
            {
                id: "prefab-zones",
                type: "fill",
                source: "prefab-locations",
                paint: {
                    "fill-color": [
                        "match",
                        ["get", "color"],
                        0,
                        blendWithBg(
                            lightenColor(AppSettings.theme.defaultColor, 0.3),
                            0.6
                        ),
                        1,
                        blendWithBg(
                            lightenColor(AppSettings.theme.defaultColor, 0.3),
                            0.6
                        ),
                        2,
                        blendWithBg(
                            lightenColor(AppSettings.theme.defaultColor, 0),
                            0.6
                        ),
                        3,
                        blendWithBg(
                            lightenColor(AppSettings.theme.defaultColor, 0.3),
                            0.6
                        ),
                        4,
                        blendWithBg(
                            lightenColor(AppSettings.theme.defaultColor, 0.3),
                            0.6
                        ),
                        blendWithBg(
                            lightenColor(AppSettings.theme.defaultColor, 0.3),
                            0.6
                        ),
                    ],
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
                "text-allow-overlap": true,
            },
            paint: {
                "text-color": "#ffffff",
            },
            minzoom: 7.9,
        });

        // DISPLAYING CITY DOTS
        map.addLayer({
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
        });

        // DISPLAYING CAPITAL DOTS
        map.addLayer({
            id: "capital-points",
            type: "circle",
            source: "ets2-cities",
            minzoom: 5,
            maxzoom: 8,
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
        map.addLayer(
            {
                id: "country-borders",
                type: "line",
                source: "country-borders",
                paint: {
                    "line-color": "#3d546e",
                    "line-width": 2.5,
                    "line-opacity": 0.4,
                },
            },
            "ets2-lines"
        );

        // DISPLAY ROAD NUMBERS ON MAP
        map.addLayer({
            id: "sprite-locations",
            type: "symbol",
            source: "sprite-locations",
            filter: ["==", ["get", "poiType"], "road"],
            minzoom: 6.5,

            layout: {
                "icon-image": ["get", "sprite"],

                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    6.5,
                    0.8,
                    //
                    10,
                    1,
                    //
                    11.2,
                    1.3,
                ],

                "symbol-placement": "point",
            },
        });

        // DISPLAY GAS ICONS ON MAP
        map.addLayer({
            id: "gas-icons",
            type: "symbol",
            source: "sprite-locations",
            filter: ["match", ["get", "sprite"], ["gas_ico"], true, false],
            minzoom: 6.5,
            layout: {
                "icon-image": ["get", "sprite"],
                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    1.4,
                    //
                    9.5,
                    1.8,
                ],
                "symbol-placement": "point",
            },
        });

        // DISPLAY TRAIN ICONS ON MAP
        map.addLayer({
            id: "train-icons",
            type: "symbol",
            source: "sprite-locations",
            filter: ["match", ["get", "poiType"], ["train"], true, false],
            minzoom: 6.5,
            layout: {
                "icon-image": ["get", "sprite"],
                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    1.4,
                    //
                    9.5,
                    1.8,
                ],
                "symbol-placement": "point",
            },
        });

        // DISPLAY FERRY ICONS ON MAP
        map.addLayer({
            id: "ferry-icons",
            type: "symbol",
            source: "sprite-locations",
            filter: ["match", ["get", "poiType"], ["ferry"], true, false],
            minzoom: 6.5,
            layout: {
                "icon-image": ["get", "sprite"],
                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    1.4,
                    //
                    9.5,
                    1.8,
                ],
                "symbol-placement": "point",
            },
        });

        // DISPLAY ROADWORK ICONS ON MAP
        map.addLayer({
            id: "roadwork-icons",
            type: "symbol",
            source: "sprite-locations",
            filter: ["match", ["get", "sprite"], ["roadwork"], true, false],
            minzoom: 6.5,
            layout: {
                "icon-image": ["get", "sprite"],
                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    0.7,
                    //
                    9.5,
                    0.9,
                ],
                "symbol-placement": "point",
            },
        });

        // DISPLAY RAILCROSSING ICONS ON MAP
        map.addLayer({
            id: "raiolcrossing-icons",
            type: "symbol",
            source: "sprite-locations",
            filter: ["match", ["get", "sprite"], ["railcrossing"], true, false],
            minzoom: 6.5,
            layout: {
                "icon-image": ["get", "sprite"],
                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    0.7,
                    //
                    9.5,
                    0.9,
                ],
                "symbol-placement": "point",
            },
        });

        // DISPLAY TOLL ICONS ON MAP
        map.addLayer({
            id: "toll-icons",
            type: "symbol",
            source: "sprite-locations",
            filter: ["match", ["get", "sprite"], ["toll_ico"], true, false],
            minzoom: 6.5,

            layout: {
                "icon-image": ["get", "sprite"],

                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    1.4,
                    //
                    9.5,
                    1.8,
                ],
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "symbol-placement": "point",
            },
        });

        // DISPLAY PARKING ON MAP
        map.addLayer(
            {
                id: "parking-icons",
                type: "symbol",
                source: "sprite-locations",
                filter: [
                    "match",
                    ["get", "sprite"],
                    ["parking_ico"],
                    true,
                    false,
                ],
                minzoom: 8,
                layout: {
                    "icon-image": ["get", "sprite"],
                    "icon-size": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        8,
                        1.4,
                        //
                        9.5,
                        1.8,
                    ],
                    "symbol-placement": "point",
                },
            },
            "gas-icons"
        );

        // DISPLAY SERVICE LOCATIONS ON MAP
        map.addLayer({
            id: "service-icons",
            type: "symbol",
            source: "sprite-locations",
            filter: ["match", ["get", "sprite"], ["service_ico"], true, false],
            minzoom: 8,

            layout: {
                "icon-image": ["get", "sprite"],

                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    1.4,
                    //
                    9.5,
                    1.8,
                ],
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "symbol-placement": "point",
            },
        });

        // DISPLAY PHOTO SIGHT LOCATIONS ON MAP
        map.addLayer({
            id: "photo-sight-icons",
            type: "symbol",
            source: "sprite-locations",
            filter: [
                "match",
                ["get", "sprite"],
                ["photo_sight_captured"],
                true,
                false,
            ],
            minzoom: 6.5,

            layout: {
                "icon-image": ["get", "sprite"],

                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    1.4,
                    //
                    9.5,
                    1.8,
                ],
                "symbol-placement": "point",

                "text-field": ["get", "poiName"],
                "text-font": ["Quicksand"],
                "text-size": 13,

                "text-offset": [0, 0.8],
                "text-anchor": "top",

                "text-optional": true,
            },
            paint: {
                "text-color": "#ffffff",

                "text-opacity": ["step", ["zoom"], 0, 9, 1],
            },
        });

        // DISPLAY VIEWPOINT ON MAP
        map.addLayer({
            id: "viewpoint-icons",
            type: "symbol",
            source: "sprite-locations",
            filter: ["match", ["get", "sprite"], ["viewpoint"], true, false],
            minzoom: 6.5,
            layout: {
                "icon-image": ["get", "sprite"],
                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    1.4,
                    //
                    9.5,
                    1.8,
                ],
                "symbol-placement": "point",
            },
        });

        // DISPLAY FACILITES ON MAP
        map.addLayer(
            {
                id: "facility-icons",
                type: "symbol",
                source: "sprite-locations",
                filter: [
                    "all",
                    ["match", ["get", "poiType"], ["facility"], true, false],
                    ["!=", ["get", "sprite"], "parking_ico"],
                    ["!=", ["get", "sprite"], "gas_ico"],
                    ["!=", ["get", "sprite"], "service_ico"],
                ],
                minzoom: 8,
                layout: {
                    "icon-image": ["get", "sprite"],
                    "icon-size": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        7.5,
                        1.2,
                        //
                        10,
                        1.8,
                    ],
                    "icon-allow-overlap": true,
                    "symbol-placement": "point",
                },
            },
            "gas-icons"
        );

        // DISPLAY COMPANIES LOCATIONS ON MAP
        map.addLayer({
            id: "companies-icons",
            type: "symbol",
            source: "sprite-locations",
            filter: ["match", ["get", "poiType"], ["company"], true, false],
            minzoom: 8,

            layout: {
                "icon-image": ["get", "sprite"],

                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    8,
                    1.4,
                    //
                    9.5,
                    1.8,
                ],
                "symbol-placement": "point",
            },
        });

        // DISPLAYING CITY NAMES
        map.addLayer({
            id: "city-labels",
            type: "symbol",
            source: "ets2-cities",
            filter: ["!=", ["get", "capital"], 2],
            layout: {
                "text-field": ["get", "name"],
                "text-font": ["Quicksand"],
                "text-size": 15,
                "text-anchor": "bottom",
                "text-offset": [0, -0.3],
                "text-allow-overlap": true,
            },
            paint: {
                "text-color": "#ffffff",

                "text-halo-color": "#ffffff",
                "text-halo-width": 0.3,
            },
            minzoom: 5.5,
            maxzoom: 8,
        });

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
            maxzoom: 8,
        });

        // DISPLAYING COUNTRY NAMES
        map.addLayer({
            id: "country-labels",
            type: "symbol",
            source: "ets2-countries",
            layout: {
                "text-field": ["get", "name"],
                "text-size": 20,
                "text-font": ["Quicksand"],
                "text-anchor": "bottom",
                "text-offset": [0, -0.3],
            },
            paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#ffffff",
                "text-halo-width": 0.5,
                "text-opacity": 0.5,
            },
            minzoom: 5,
            maxzoom: 5.5,
        });

        map.addControl(new maplibregl.NavigationControl());
    });

    return map;
}
