import { ref, onUnmounted } from "vue";
import type { TelemetryData } from "../../shared/types/Telemetry/TelemetryData";
import { convertGameToGeo } from "~/assets/utils/gameToGeo";
import { getBearing } from "~/assets/utils/geographicMath";
import { convertTelemtryTime } from "~/assets/utils/helpers";

const TELEMETRY_API = "/api/ets2";

export function useEtsTelemetry() {
    const isTelemetryConnected = ref(false);
    const isRunning = ref(false);

    // TRUCK STATE
    const truckCoords = ref<[number, number] | null>(null);
    const truckHeading = ref<number>(0);
    const truckSpeed = ref<number>(0);

    // GAME STATE
    const gameTime = ref<string>("");
    const gameConnected = ref<boolean>(false);
    const restStoptime = ref<string>("");
    const restStopMinutes = ref<number>(0);

    // NAVIGATION STATE
    const speedLimit = ref<number>(0);
    const fuel = ref<number>(0);
    const hasInGameMarker = ref(false);

    let lastPosition: [number, number] | null = null;
    let headingOffset = 0;

    let fetchTimer: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;

    function startTelemetry(
        onUpdate?: (
            coords: [number, number],
            heading: number,
            time: string
        ) => void
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
                    cache: "no-cache",
                    headers: { Pragma: "no-cache" },
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const result = await response.json();
                    if (result.connected && result.telemetry.game?.connected) {
                        isTelemetryConnected.value = true;
                        processData(result.telemetry, onUpdate);
                    } else {
                        resetDataOnDisconnected(onUpdate);
                    }
                }
            } catch (err) {
                if (err instanceof Error && err.name !== "AbortError") {
                    isTelemetryConnected.value = false;
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

    function resetDataOnDisconnected(
        onUpdate?: (
            coords: [number, number],
            heading: number,
            time: string,
            gameConnected: boolean,
            speedLimit: number,
            speedKmh: number,
            gas: string,
            restStoptime: string,
            inGameMarker: boolean
        ) => void
    ) {
        const wasConnected = gameConnected.value;

        isTelemetryConnected.value = false;
        truckSpeed.value = 0;
        gameConnected.value = false;
        speedLimit.value = 0;
        fuel.value = 0;
        restStoptime.value = "0";
        hasInGameMarker.value = false;

        if (onUpdate && wasConnected) {
            onUpdate([0, 0], 0, "", false, 0, 0, "0", "0", false);
        }
    }

    function processData(
        data: TelemetryData,
        onUpdate?: (
            coords: [number, number],
            heading: number,
            time: string,
            gameConnected: boolean,
            speedLimit: number,
            speedKmh: number,
            gas: string,
            restStoptime: string,
            inGameMarker: boolean
        ) => void
    ) {
        // Truck Placement
        const { x, z } = data.truck.placement;
        const rawGameHeading = data.truck.placement.heading;
        const currentCoords = convertGameToGeo(x, z);

        // Truck speed
        const speedKmh = Math.max(0, Math.floor(data.truck.speed));

        // Game Connected
        const connected = data.game.connected;

        // Has a destionation in Game (Excludin Jobs)
        const inGameMarker =
            data.navigation.estimatedDistance > 100 && data.job.income === 0;

        // Game Time
        const { formatted: formattedTime, raw } = convertTelemtryTime(
            data.game.time
        );
        const day = raw.toUTCString().slice(0, 3);
        const time = `${day} ${formattedTime}`;

        // Speed Limit + Fuel + Next Rest Stop Time
        const sLimit = data.navigation.speedLimit;
        const gas = data.truck.fuel.toFixed(1);
        const { formatted: restTime, raw: restRaw } = convertTelemtryTime(
            data.game.nextRestStopTime
        );
        const minutes = restRaw.getUTCHours() * 60 + restRaw.getUTCMinutes();

        // Calculate heading correctly.
        const rawDegrees = -rawGameHeading * 360;
        if (lastPosition && speedKmh > 10) {
            const dist = Math.sqrt(
                Math.pow(currentCoords[0] - lastPosition[0], 2) +
                    Math.pow(currentCoords[1] - lastPosition[1], 2)
            );

            if (dist > 0.00005) {
                const trueBearing = getBearing(lastPosition, currentCoords);

                let diff = trueBearing - rawDegrees;
                while (diff < -180) diff += 360;
                while (diff > 180) diff -= 360;

                if (Math.abs(diff) < 90) {
                    headingOffset += (diff - headingOffset) * 0.1;
                }
            }
        }
        let finalHeading = rawDegrees + headingOffset;
        finalHeading = ((finalHeading % 360) + 360) % 360;

        // Truck state.
        truckCoords.value = currentCoords;
        truckHeading.value = finalHeading;
        truckSpeed.value = speedKmh;
        fuel.value = parseInt(gas);

        // Game state.
        gameTime.value = time;
        gameConnected.value = connected;
        restStoptime.value = restTime;
        restStopMinutes.value = minutes;

        // Navigation state.
        speedLimit.value = sLimit;
        hasInGameMarker.value = inGameMarker;
        console.log(hasInGameMarker);

        lastPosition = currentCoords;

        if (onUpdate) {
            onUpdate(
                currentCoords,
                finalHeading,
                time,
                connected,
                sLimit,
                speedKmh,
                gas,
                restTime,
                inGameMarker
            );
        }
    }

    onUnmounted(() => {
        stopTelemetry();
    });

    return {
        fuel,
        gameConnected,
        truckCoords,
        truckHeading,
        truckSpeed,
        speedLimit,
        restStoptime,
        gameTime,
        hasInGameMarker,
        restStopMinutes,
        startTelemetry,
        stopTelemetry,
    };
}
