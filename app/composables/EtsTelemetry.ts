import { ref, onUnmounted } from "vue";
import type { TelemetryData } from "../../shared/types/Telemetry/TelemetryData";
import { convertGameToGeo } from "~/assets/utils/gameToGeo";
import { getBearing } from "~/assets/utils/geographicMath";
import { convertTelemtryTime } from "~/assets/utils/helpers";
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const { isElectron, isMobile, isWeb } = usePlatform();
const { savedIP } = useSettings();

export interface TelemetryUpdate {
    truck: TruckState;
    game: GameState;
    general: GeneralInfo;
    job: JobInfo;
}

interface GameState {
    gameTime: string;
    gameConnected: boolean;
    hasInGameMarker: boolean;
}

interface TruckState {
    truckCoords: [number, number] | null;
    truckHeading: number;
    truckSpeed: number;
}

interface GeneralInfo {
    fuel: number;
    speedLimit: number;
    restStoptime: string;
    restStopMinutes: number;
}

interface JobInfo {
    hasActiveJob: boolean;
    income: number;
    deadlineTime: Date;
    remainingTime: Date;
    sourceCity: string;
    sourceCompany: string;
    destinationCity: string;
    destinationCompany: string;
}

export function useEtsTelemetry() {
    const isTelemetryConnected = ref(false);
    const isRunning = ref(false);

    // TRUCK STATE
    const truckState = reactive<TruckState>({
        truckCoords: [0, 0],
        truckHeading: 0,
        truckSpeed: 0,
    });

    // GAME STATE
    const gameState = reactive<GameState>({
        gameTime: "",
        gameConnected: false,
        hasInGameMarker: false,
    });

    // GAME INFO
    const generalInfo = reactive<GeneralInfo>({
        fuel: 0,
        speedLimit: 0,
        restStoptime: "",
        restStopMinutes: 0,
    });

    // JOB INFO
    const jobInfo = reactive<JobInfo>({
        hasActiveJob: false,
        income: 0,
        deadlineTime: new Date(),
        remainingTime: new Date(),
        sourceCity: "0",
        sourceCompany: "0",
        destinationCity: "0",
        destinationCompany: "0",
    });

    let lastPosition: [number, number] | null = null;
    let headingOffset = 0;

    let fetchTimer: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;

    function getCorrectHeading(
        rawGameHeading: number,
        truckSpeed: number,
        currentCoords: [number, number]
    ) {
        const rawDegrees = -rawGameHeading * 360;

        if (lastPosition && truckSpeed > 10) {
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

        return finalHeading;
    }

    function startTelemetry(onUpdate?: (data: TelemetryUpdate) => void) {
        if (isRunning.value) return;
        isRunning.value = true;

        const loop = async () => {
            if (!isRunning.value) return;
            const startTime = performance.now();

            try {
                if (isMobile.value) {
                    try {
                        const response = await CapacitorHttp.get({
                            url: `http://${savedIP.value}:25555/api/ets2/telemetry`,
                            connectTimeout: 1000,
                        });

                        if (response.status === 200) {
                            const telemetryData = response.data;

                            if (
                                telemetryData &&
                                telemetryData.game?.connected
                            ) {
                                isTelemetryConnected.value = true;
                                processData(telemetryData, onUpdate);
                            } else {
                                resetDataOnDisconnected(onUpdate);
                            }
                        } else {
                            isTelemetryConnected.value = false;
                        }
                    } catch (err) {
                        console.log(err);
                    }
                } else if (isWeb.value) {
                    if (abortController) abortController.abort();
                    abortController = new AbortController();
                    const timeoutId = setTimeout(
                        () => abortController?.abort(),
                        1000
                    );

                    const response = await fetch("/api/ets2", {
                        signal: abortController.signal,
                        cache: "no-cache",
                        headers: { Pragma: "no-cache" },
                    });

                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const result = await response.json();
                        if (
                            result.connected &&
                            result.telemetry.game?.connected
                        ) {
                            isTelemetryConnected.value = true;
                            processData(result.telemetry, onUpdate);
                        } else {
                            resetDataOnDisconnected(onUpdate);
                        }
                    }
                } else if (isElectron.value) {
                    const telemetryData = await (
                        window as any
                    ).electronAPI.fetchTelemetry("127.0.0.1");

                    if (telemetryData && telemetryData.game?.connected) {
                        isTelemetryConnected.value = true;
                        processData(telemetryData, onUpdate);
                    } else {
                        resetDataOnDisconnected(onUpdate);
                    }
                }
            } catch (err) {
                console.log(err);
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
        onUpdate?: (data: TelemetryUpdate) => void
    ) {
        const wasConnected = gameState.gameConnected;

        isTelemetryConnected.value = false;

        // GAME STATE
        Object.assign(gameState, {
            gameConnected: false,
            hasInGameMarker: false,
            gameTime: "",
        });

        // TRUCK STATE
        Object.assign(truckState, {
            truckCoords: [0, 0],
            truckHeading: 0,
            truckSpeed: 0,
        });

        // GENERAL INFO
        Object.assign(generalInfo, {
            fuel: 0,
            speedLimit: 0,
            restStopMinutes: 0,
            restStoptime: "0",
        });

        // JOB INFO
        Object.assign(jobInfo, {
            hasActiveJob: false,
        });

        if (onUpdate && wasConnected) {
            onUpdate({
                truck: { ...truckState },
                game: { ...gameState },
                general: { ...generalInfo },
                job: { ...jobInfo },
            });
        }
    }

    function processData(
        data: TelemetryData,
        onUpdate?: (data: TelemetryUpdate) => void
    ) {
        // Truck Placement

        // GAME STATE
        const gameConnected = data.game.connected;
        const hasInGameMarker =
            data.navigation.estimatedDistance > 100 && data.job.income === 0;

        const { formatted: formattedTime, raw } = convertTelemtryTime(
            data.game.time
        );
        const day = raw.toUTCString().slice(0, 3);
        const gameTime = `${day} ${formattedTime}`;

        // TRUCK STATE
        const { x, z } = data.truck.placement;
        const rawGameHeading = data.truck.placement.heading;
        const truckCoords = convertGameToGeo(x, z);
        const truckSpeed = Math.max(0, Math.floor(data.truck.speed));
        const truckHeading = getCorrectHeading(
            rawGameHeading,
            truckSpeed,
            truckCoords
        );

        // GENERAL INFO
        const fuel = parseInt(data.truck.fuel.toFixed(1));
        const speedLimit = data.navigation.speedLimit;
        const { formatted: restStoptime, raw: restRaw } = convertTelemtryTime(
            data.game.nextRestStopTime
        );
        const restStopMinutes =
            restRaw.getUTCHours() * 60 + restRaw.getUTCMinutes();

        // JOB INFO
        const hasActiveJob = data.job.income > 0;
        const destinationCity = data.job.destinationCity;
        const destinationCompany = data.job.destinationCompany;

        // GAME STATE
        Object.assign(gameState, {
            gameTime: gameTime,
            gameConnected: gameConnected,
            hasInGameMarker: hasInGameMarker,
        });

        // TRUCK STATE
        Object.assign(truckState, {
            truckCoords: truckCoords,
            truckHeading: truckHeading,
            truckSpeed: truckSpeed,
        });

        // GENERAL INFO
        Object.assign(generalInfo, {
            restStoptime: restStoptime,
            restStopMinutes: restStopMinutes,
            speedLimit: speedLimit,
            fuel: fuel,
        });

        // JOB INFO
        Object.assign(jobInfo, {
            hasActiveJob: hasActiveJob,
            destinationCity: destinationCity,
            destinationCompany: destinationCompany,
        });

        lastPosition = truckCoords;

        if (onUpdate) {
            onUpdate({
                truck: { ...truckState },
                game: { ...gameState },
                general: { ...generalInfo },
                job: { ...jobInfo },
            });
        }
    }

    onUnmounted(() => {
        stopTelemetry();
    });

    return {
        ...toRefs(generalInfo),
        ...toRefs(truckState),
        ...toRefs(gameState),
        ...toRefs(jobInfo),
        startTelemetry,
        stopTelemetry,
    };
}
