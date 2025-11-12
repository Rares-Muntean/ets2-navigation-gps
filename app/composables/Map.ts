import { latLng, type Map } from "leaflet";
import * as Variables from "~~/shared/variables";

export const useMap = () => {
    const map = ref<Map>();
    const nuxtApp = useNuxtApp();

    const initMap = (mapId: string) => {
        map.value = nuxtApp.$leaflet.map(mapId, {
            crs: nuxtApp.$leaflet.CRS.Simple,
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

        const center = latLng(
            -Variables.TILE_SIZE / 2,
            Variables.TILE_SIZE / 2
        );

        map.value.setView(center, 0);

        const bounds = nuxtApp.$leaflet.latLngBounds(southWest, northEast);

        map.value.setMaxBounds(bounds.pad(0.2));

        nuxtApp.$leaflet
            .tileLayer("./Tiles/{z}/{x}/{y}.png", {
                tileSize: Variables.TILE_SIZE,
                noWrap: true,
                tms: true,
                maxNativeZoom: Variables.TILESET_MAX_ZOOM,
                maxZoom: Variables.TILESET_MAX_ZOOM,
                bounds: bounds,
            })
            .addTo(map.value);
    };

    return { map, initMap };
};
