import type { Marker } from "maplibre-gl";
import { Map } from "maplibre-gl";
import maplibregl from "maplibre-gl";

export const useTruckMarker = (map: Ref<Map | null>) => {
    const truckMarker = shallowRef<Marker | null>(null);

    const setupTruckMarker = (element: HTMLElement) => {
        if (!map.value) return;

        truckMarker.value = new maplibregl.Marker({
            element: element,
            anchor: "center",
            rotationAlignment: "map",
            pitchAlignment: "map",
        })
            .setLngLat([0, 0])
            .addTo(map.value);
    };

    const updateTruckMarkerPosition = (
        coords: [number, number],
        heading: number
    ) => {
        truckMarker.value?.setLngLat(coords);
        truckMarker.value?.setRotation(heading);
    };

    const removeMarker = () => {
        truckMarker.value?.remove();
        truckMarker.value = null;
    };

    return {
        truckMarker,
        setupTruckMarker,
        updateTruckMarkerPosition,
        removeMarker,
    };
};
