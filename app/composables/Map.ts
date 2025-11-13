import type { Map } from "leaflet";
import * as Variables from "~~/shared/variables";

export const useMap = () => {
    const map = ref<Map>();

    const initMap = async (mapId: string) => {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        map.value = L.map(mapId, {
            crs: L.CRS.Simple,
            minZoom: 3,
            maxZoom: Variables.TILESET_MAX_ZOOM,
            zoomSnap: 0.5,
            zoomDelta: 0.5,
        });

        const southWest = map.value.unproject(
            [0, Variables.SOUTH_PIXELS],
            Variables.TILESET_MAX_ZOOM
        );

        const northEast = map.value.unproject(
            [Variables.EAST_PIXELS, 0],
            Variables.TILESET_MAX_ZOOM
        );

        const center = L.latLng(
            -Variables.TILE_SIZE / 2,
            Variables.TILE_SIZE / 2
        );

        map.value.setView(center, 0);

        const bounds = L.latLngBounds(southWest, northEast);

        map.value.setMaxBounds(bounds.pad(0.2));

        L.tileLayer("./Tiles/{z}/{x}/{y}.png", {
            tileSize: Variables.TILE_SIZE,
            noWrap: true,
            tms: true,
            maxNativeZoom: Variables.TILESET_MAX_ZOOM,
            maxZoom: Variables.TILESET_MAX_ZOOM,
            bounds: bounds,
        }).addTo(map.value);
    };

    return { map, initMap };
};
