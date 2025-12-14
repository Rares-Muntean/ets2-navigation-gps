import { shallowRef, ref } from "vue";
import { convertGeoToGame } from "~/assets/utils/gameToGeo";

// --- Types ---
interface GeoJsonProperties {
    name: string;
    countryToken?: string;
    scaleRank?: number;
    state?: string;
    [key: string]: any;
}

interface GeoJsonFeature {
    type: "Feature";
    geometry: {
        type: "Point";
        coordinates: [number, number];
    };
    properties: GeoJsonProperties;
}

interface GeoJsonCollection {
    type: "FeatureCollection";
    features: GeoJsonFeature[];
}

const cityData = shallowRef<GeoJsonCollection | null>(null);
const villageData = shallowRef<GeoJsonCollection | null>(null);
const isLoaded = ref(false);

export function useCityData() {
    async function loadLocationData() {
        if (isLoaded.value) return;

        try {
            const [citiesRes, villagesRes] = await Promise.all([
                fetch("/map-data/ets2-cities.geojson"),
                fetch("/map-data/ets2-villages.geojson"),
            ]);

            if (citiesRes.ok) cityData.value = await citiesRes.json();
            if (villagesRes.ok) villageData.value = await villagesRes.json();

            isLoaded.value = true;
        } catch (e) {
            console.error("Failed to load map data:", e);
        }
    }

    function getScaleForLocation(
        routeGameX: number,
        routeGameZ: number
    ): number {
        let scale = 19;

        if (!cityData.value || !cityData.value.features) return scale;

        for (const feature of cityData.value.features) {
            const [cityLng, cityLat] = feature.geometry.coordinates;

            const [cityGameX, cityGameZ] = convertGeoToGame(cityLng, cityLat);

            const dx = routeGameX - cityGameX;
            const dy = routeGameZ - cityGameZ;
            const distToCityCenter = Math.sqrt(dx * dx + dy * dy);

            let safeRadius = 900;

            if (
                feature.properties.scaleRank &&
                feature.properties.scaleRank < 3
            ) {
                safeRadius = 500;
            }

            if (distToCityCenter < safeRadius) {
                return 3;
            }
        }

        return 19;
    }

    function buildRouteStatsCache(pathCoords: [number, number][]) {
        const cache = new Float32Array(pathCoords.length * 2);

        let totalGameKm = 0;
        let totalGameHours = 0;

        cache[0] = 0; // km
        cache[1] = 0; // hours

        for (let i = 0; i < pathCoords.length - 1; i++) {
            const point1 = convertGeoToGame(
                pathCoords[i]![0],
                pathCoords[i]![1]
            );
            const point2 = convertGeoToGame(
                pathCoords[i + 1]![0],
                pathCoords[i + 1]![1]
            );

            const dx = point2[0] - point1[0];
            const dy = point2[1] - point1[1];
            const rawSegmentLength = Math.sqrt(dx * dx + dy * dy);

            const midX = (point1[0] + point2[0]) / 2;
            const midZ = (point1[1] + point2[1]) / 2;

            // Same logic as in calculategameroute but much performant.
            const multiplier = getScaleForLocation(midX, midZ);

            const segmentKm = (rawSegmentLength * multiplier) / 1000;
            totalGameKm += segmentKm;

            let segmentSpeed = 70;
            if (multiplier === 3) segmentSpeed = 35;

            const segmentHours = segmentKm / segmentSpeed;
            totalGameHours += segmentHours;

            const nextIdx = (i + 1) * 2;
            cache[nextIdx] = totalGameKm;
            cache[nextIdx + 1] = totalGameHours;
        }

        return cache;
    }

    function calculateGameRouteDetails(pathCoords: [number, number][]) {
        let totalGameKm = 0;
        let totalGameHours = 0;

        for (let i = 0; i < pathCoords.length - 1; i++) {
            const point1 = convertGeoToGame(
                pathCoords[i]![0],
                pathCoords[i]![1]
            );
            const point2 = convertGeoToGame(
                pathCoords[i + 1]![0],
                pathCoords[i + 1]![1]
            );

            const dx = point2[0] - point1[0];
            const dy = point2[1] - point1[1];
            const rawSegmentLength = Math.sqrt(dx * dx + dy * dy);

            const midX = (point1[0] + point2[0]) / 2;
            const midZ = (point1[1] + point2[1]) / 2;

            const multiplier = getScaleForLocation(midX, midZ);

            const segmentKm = (rawSegmentLength * multiplier) / 1000;

            totalGameKm += segmentKm;
            let segmentSpeed = 70;

            if (multiplier === 3) {
                segmentSpeed = 35;
            }

            const segmentHours = segmentKm / segmentSpeed;

            totalGameHours += segmentHours;
        }

        const h = Math.floor(totalGameHours);
        const m = Math.round((totalGameHours - h) * 60);

        return {
            km: Math.round(totalGameKm),
            time: `${h}h ${m}min`,
        };
    }

    function getGameLocationName(targetX: number, targetY: number): string {
        if (!isLoaded.value) return "Loading data...";

        let bestName = "";
        let bestCountry = "";
        let minDistance = Infinity;

        const checkFeatures = (
            collection: GeoJsonCollection | null,
            type: "city" | "village"
        ) => {
            if (!collection || !collection.features) return;

            for (const feature of collection.features) {
                const [lng, lat] = feature.geometry.coordinates;

                const dx = lng - targetX;
                const dy = lat - targetY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDistance) {
                    minDistance = dist;
                    bestName = feature.properties.name;

                    if (type === "city") {
                        bestCountry = formatCountryToken(
                            feature.properties.countryToken
                        );
                    } else {
                        bestCountry = feature.properties.state || "";
                    }
                }
            }
        };

        checkFeatures(cityData.value, "city");
        checkFeatures(villageData.value, "village");

        if (bestName) {
            const threshold = 0.3;

            const fullName = bestCountry
                ? `${bestName}, ${bestCountry}`
                : bestName;

            if (minDistance < threshold) {
                return fullName;
            } else {
                return `Near ${fullName}`;
            }
        }

        return "Open Road";
    }

    function formatCountryToken(token?: string): string {
        if (!token) return "";
        return token
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    return {
        loadLocationData,
        getGameLocationName,
        buildRouteStatsCache,
        calculateGameRouteDetails,
    };
}
