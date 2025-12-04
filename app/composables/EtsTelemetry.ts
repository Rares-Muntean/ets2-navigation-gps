import { ref, onUnmounted } from "vue";
import type { TelemetryData } from "../../shared/types/Telemetry/TelemetryData";
import proj4 from "proj4";

const TELEMETRY_API = "/api/ets2";

export function useEtsTelemetry() {
    const isConnected = ref(false);
    const isRunning = ref(false);
    const truckCoords = ref<[number, number] | null>(null);
    const truckHeading = ref<number>(0);
    const truckSpeed = ref<number>(0);

    let fetchTimer: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;

    function startTelemetry(
        onUpdate?: (coords: [number, number], heading: number) => void
    ) {
        if (isRunning.value) return;
        isRunning.value = true;

        const loop = async () => {
            if (!isRunning.value) return;
            const startTime = performance.now();

            try {
                if (abortController) abortController.abort();
                abortController = new AbortController();

                const timeoutId = setTimeout(
                    () => abortController?.abort(),
                    1000
                );

                const response = await fetch(TELEMETRY_API, {
                    signal: abortController.signal,
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();

                    if (data?.game?.connected) {
                        isConnected.value = true;
                        processData(data, onUpdate);
                    } else {
                        isConnected.value = false;
                    }
                }
            } catch (err) {
                if (err instanceof Error && err.name !== "AbortError") {
                    isConnected.value = false;
                }
            }

            const duration = performance.now() - startTime;
            const delay = Math.max(50, 100 - duration);

            fetchTimer = setTimeout(loop, delay);
        };

        loop();
    }

    function stopTelemetry() {
        isRunning.value = false;
        if (fetchTimer) clearTimeout(fetchTimer);
        if (abortController) abortController.abort();
        fetchTimer = null;
    }

    function processData(
        data: TelemetryData,
        onUpdate?: (coords: [number, number], heading: number) => void
    ) {
        const { x, z } = data.truck.placement;
        const heading = data.truck.placement.heading;
        const speed = data.truck.speed;

        // 2. CONVERT TO LAT/LON
        const coords = convertGameToGeo(x, z);

        // 3. UPDATE STATE
        truckCoords.value = coords;
        console.log(heading);
        const degrees = -heading * 360;

        truckHeading.value = degrees - 15;
        truckSpeed.value = Math.floor(speed * 3.6);

        // 4. TRIGGER CALLBACK (For direct map manipulation)
        if (onUpdate) {
            onUpdate(coords, truckHeading.value);
        }
    }

    onUnmounted(() => {
        stopTelemetry();
    });

    return {
        isConnected,
        isRunning,
        truckCoords,
        truckHeading,
        truckSpeed,
        startTelemetry,
        stopTelemetry,
    };
}

const EARTH_RADIUS = 6370997;
const DEG_LEN = (EARTH_RADIUS * Math.PI) / 180;

const PROJ_DEF = "+proj=lcc +lat_1=37 +lat_2=65 +lat_0=50 +lon_0=15 +R=6370997";
const MAP_OFFSET = [16660, 4150] as const;
const MAP_FACTOR = [-0.000171570875, 0.0001729241463] as const;

const converter = proj4(PROJ_DEF);

function convertGameToGeo(gameX: number, gameZ: number): [number, number] {
    let x = gameX - MAP_OFFSET[0];
    let y = gameZ - MAP_OFFSET[1];

    const ukScale = 0.75;
    const calaisBound = [-31100, -5500] as const;

    if (x * ukScale < calaisBound[0] && y * ukScale < calaisBound[1]) {
        x = (x + calaisBound[0] / 2) * ukScale;
        y = (y + calaisBound[1] / 2) * ukScale;
    }

    const projectedX = x * MAP_FACTOR[1] * DEG_LEN;
    const projectedY = y * MAP_FACTOR[0] * DEG_LEN;

    const result = converter.inverse([projectedX, projectedY]);

    return result as [number, number];
}
