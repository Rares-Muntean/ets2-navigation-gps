import { Map } from "maplibre-gl";

export const useMapCamera = (map: Ref<Map | null>) => {
    const isCameraLocked = ref(false);
    const isNavigating = ref(false);

    const breakLockEvents = [
        "dragstart",
        "touchstart",
        "wheel",
        "pitchstart",
        "boxzoomstart",
    ];

    const initCameraListeners = () => {
        if (!map.value) return;
        breakLockEvents.forEach((event) => {
            map.value!.on(event, () => {
                if (isCameraLocked.value) isCameraLocked.value = false;
            });
        });
    };

    const followTruck = (coords: [number, number], heading: number) => {
        if (!isCameraLocked.value || !map.value) return;

        map.value.easeTo({
            center: coords,
            bearing: isNavigating.value ? heading : 0,
            pitch: map.value.getPitch(),
            zoom: map.value.getZoom(),
            duration: 300,
            offset: [0, 50],
            easing: (t) => t,
        });
    };

    const lockCamera = () => {
        if (!map.value) return;
        isCameraLocked.value = true;
    };

    const startNavigationMode = (coords: [number, number], heading: number) => {
        if (!map.value) return;
        isNavigating.value = true;
        isCameraLocked.value = true;

        map.value.easeTo({
            center: coords,
            bearing: isNavigating.value ? heading : 0,
            pitch: 35,
            zoom: map.value.getZoom(),

            duration: 0,

            offset: [0, 50],
            easing: (t) => t,
        });
    };

    return {
        isCameraLocked,
        isNavigating,
        initCameraListeners,
        followTruck,
        lockCamera,
        startNavigationMode,
    };
};
