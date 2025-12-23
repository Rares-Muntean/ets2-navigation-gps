import { shallowRef, ref } from "vue";
import { loadGraph } from "~/assets/utils/clientGraph";
import { convertGeoToGame } from "~/assets/utils/gameToGeo";
import {
    getScaleMultiplier,
    type SimpleCityNode,
} from "~/assets/utils/routeAlgorithm";

// --- Types ---
interface GeoJsonProperties {
    name: string;
    poiName: string;
    poiType: string;
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

interface CityFallback {
    FirstName: string;
    SecondName: string;
}

const cityData = shallowRef<GeoJsonCollection | null>(null);
const villageData = shallowRef<GeoJsonCollection | null>(null);
const companiesData = shallowRef<GeoJsonCollection | null>(null);
const citiesFallbackData = shallowRef<CityFallback[] | null>(null);

const isLoaded = ref(false);
const optimizedCityNodes = shallowRef<SimpleCityNode[]>([]);

export function useCityData() {
    async function loadLocationData() {
        if (isLoaded.value) return;

        try {
            const [citiesRes, villagesRes, companiesRes, citiesFallbackRes] =
                await Promise.all([
                    fetch("/map-data/ets2-cities.geojson"),
                    fetch("/map-data/ets2-villages.geojson"),
                    fetch("/map-data/ets2-companies.geojson"),
                    fetch("/map-data/citiesCheck.json"),
                ]);

            if (citiesRes.ok) cityData.value = await citiesRes.json();
            if (villagesRes.ok) villageData.value = await villagesRes.json();
            if (companiesRes.ok)
                companiesData.value = await companiesRes.json();
            if (citiesFallbackRes.ok)
                citiesFallbackData.value = await citiesFallbackRes.json();
            const cNodes = processCollection(cityData.value);

            optimizedCityNodes.value = [...cNodes!];

            isLoaded.value = true;
        } catch (e) {
            console.error("Failed to load map data:", e);
        }
    }

    function getScaleForLocation(
        routeGameX: number,
        routeGameZ: number
    ): number {
        return getScaleMultiplier(
            routeGameX,
            routeGameZ,
            optimizedCityNodes.value
        );
    }

    function findDestinationCoords(
        targetCityName: string,
        targetCompanyName: string
    ): [number, number] | null {
        if (!isLoaded.value || !companiesData.value) return null;

        let cityCoords = getCityGeoCoordinates(targetCityName);
        if (!cityCoords) {
            console.log(
                `Primary name failed: ${targetCityName}. Searching for aliases...`
            );

            const aliasEntry = citiesFallbackData.value?.find(
                (c) =>
                    c.FirstName.toLowerCase() ===
                        targetCityName.toLowerCase() ||
                    c.SecondName.toLowerCase() === targetCityName.toLowerCase()
            );

            if (aliasEntry) {
                if (aliasEntry.SecondName && aliasEntry.SecondName !== "") {
                    console.log(
                        `Trying SecondName alias: ${aliasEntry.SecondName}`
                    );
                    cityCoords = getCityGeoCoordinates(aliasEntry.SecondName);
                }

                if (!cityCoords && aliasEntry.FirstName) {
                    console.log(
                        `Trying FirstName alias: ${aliasEntry.FirstName}`
                    );
                    cityCoords = getCityGeoCoordinates(aliasEntry.FirstName);
                }
            }
        }

        if (!cityCoords) {
            console.log(
                `City totally not found in geo-data: ${targetCityName}. Manually insert it in citiesCheck.json`
            );
            return null;
        }

        const safeCompanyName = targetCompanyName.toLowerCase().trim();

        const companyCandidates = companiesData.value.features.filter((f) => {
            const p = f.properties;

            return (
                p.poiType === "company" &&
                p.poiName &&
                p.poiName.toLowerCase().trim() === safeCompanyName
            );
        });

        if (companyCandidates.length === 0) {
            console.warn(`Company not found in data ${targetCompanyName}`);

            return [cityCoords[0], cityCoords[1]];
        }

        let bestCandidate: GeoJsonFeature | null = null;
        let minDistance = Infinity;

        const [cityLng, cityLat] = cityCoords;

        for (const candidate of companyCandidates) {
            const [companyLng, companyLat] = candidate.geometry.coordinates;

            const differenceX = companyLng - cityLng;
            const differenceY = companyLat - cityLat;
            const distance =
                differenceX * differenceX + differenceY * differenceY;

            if (distance < minDistance) {
                minDistance = distance;
                bestCandidate = candidate;
            }
        }

        if (bestCandidate) {
            const [finalLng, finalLat] = bestCandidate.geometry.coordinates;

            return [finalLng, finalLat];
        }

        return null;
    }

    function getCityGeoCoordinates(name: string): [number, number] | null {
        const searchName = name.toLowerCase().trim();

        const findIn = (col: GeoJsonCollection | null) => {
            if (!col || !col.features) return null;
            return col.features.find(
                (f) =>
                    f.properties.name &&
                    f.properties.name.toLowerCase() === searchName
            );
        };

        const city = findIn(cityData.value);
        if (city) return city.geometry.coordinates;

        return null;
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

            const multiplier = getScaleMultiplier(
                midX,
                midZ,
                optimizedCityNodes.value
            );

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

    const processCollection = (collection: GeoJsonCollection | null) => {
        const nodes: SimpleCityNode[] = [];
        if (!collection || !collection.features) return;

        for (const feature of collection.features) {
            const [lng, lat] = feature.geometry.coordinates;

            const [gameX, gameZ] = convertGeoToGame(lng, lat);

            let radius = 900;
            if (
                feature.properties.scaleRank &&
                feature.properties.scaleRank < 3
            ) {
                radius = 500;
            }

            nodes.push({
                x: gameX,
                z: gameZ,
                radius: radius,
            });
        }

        return nodes;
    };

    function getWorkerCityData() {
        return processCollection(cityData.value);
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
        getScaleForLocation,
        getWorkerCityData,
        calculateGameRouteDetails,
        findDestinationCoords,
    };
}
