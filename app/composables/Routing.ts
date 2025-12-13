import { MinHeap } from "~/assets/utils/MinHeap";
import {
    getBearing,
    getAngleDiff,
    getSignedAngle,
} from "~/assets/utils/geographicMath";

const MAX_NODES = 900000;

const cache_costs = new Float64Array(MAX_NODES);
const cache_previous = new Int32Array(MAX_NODES);
const cache_visited = new Uint8Array(MAX_NODES);

let cache_flatCoords: Float64Array | null = null;

function ensureCoordCache(nodeCoords: Map<number, [number, number]>) {
    if (cache_flatCoords && cache_flatCoords.length > 0) return;

    cache_flatCoords = new Float64Array(MAX_NODES * 2);

    for (const [id, [lng, lat]] of nodeCoords) {
        if (id * 2 + 1 < cache_flatCoords.length) {
            cache_flatCoords[id * 2] = lng;
            cache_flatCoords[id * 2 + 1] = lat;
        }
    }
}

function fastDistKm(
    lng1: number,
    lat1: number,
    lng2: number,
    lat2: number
): number {
    const ky = 111.0;
    const kx = 111.0 * 0.65;

    const dy = (lat1 - lat2) * ky;
    const dx = (lng1 - lng2) * kx;

    return Math.sqrt(dx * dx + dy * dy);
}

export function useRouting() {
    const mergeClosePoints = (
        coords: [number, number][],
        minDistanceMeters = 5
    ): [number, number][] => {
        if (coords.length < 2) return coords;
        const result: [number, number][] = [];
        let i = 0;
        while (i < coords.length) {
            const current = coords[i]!;
            if (i === coords.length - 1) {
                result.push(current);
                break;
            }
            const next = coords[i + 1]!;
            const d =
                fastDistKm(current[0], current[1], next[0], next[1]) * 1000;

            if (d < minDistanceMeters) {
                const midPoint: [number, number] = [
                    (current[0] + next[0]) / 2,
                    (current[1] + next[1]) / 2,
                ];
                result.push(midPoint);
                i += 2;
            } else {
                result.push(current);
                i++;
            }
        }
        if (result.length < 2) result.push(coords[coords.length - 1]!);
        return result;
    };

    const calculateRoute = (
        start: number,
        possibleEnds: Set<number | undefined>,
        startHeading: number | null,
        adjacency: Map<number, { to: number; weight: number; r: number }[]>,
        nodeCoords: Map<number, [number, number]>,
        startType: "road" | "yard" = "road",
        targetLocation?: [number, number]
    ): { path: [number, number][]; endId: number } | null => {
        ensureCoordCache(nodeCoords);
        const flatCoords = cache_flatCoords!;

        cache_costs.fill(Infinity);
        cache_previous.fill(-1);
        cache_visited.fill(0);

        const openHeap = new MinHeap(5000);

        let destLng = 0,
            destLat = 0;
        let foundDest = false;

        if (targetLocation) {
            destLng = targetLocation[0];
            destLat = targetLocation[1];
            foundDest = true;
        } else {
            const firstEndId = [...possibleEnds][0];
            if (firstEndId !== undefined) {
                destLng = flatCoords[firstEndId * 2]!;
                destLat = flatCoords[firstEndId * 2 + 1]!;
                foundDest = true;
            }
        }

        if (!foundDest) return null;

        const startLng = flatCoords[start * 2]!;
        const startLat = flatCoords[start * 2 + 1]!;

        const distKm = fastDistKm(startLng, startLat, destLng, destLat);
        const maxIterations = 5000 + distKm * 500;

        const HEURISTIC_SCALE = 3.0;

        const getHeuristic = (id: number) => {
            const nLng = flatCoords[id * 2]!;
            const nLat = flatCoords[id * 2 + 1]!;
            const dx = nLng - destLng;
            const dy = nLat - destLat;
            return Math.sqrt(dx * dx + dy * dy) * 100 * HEURISTIC_SCALE;
        };

        cache_costs[start] = 0;
        openHeap.push(start, 0);

        let foundEndId: number | null = null;
        let iterations = 0;

        while (openHeap.size() > 0) {
            iterations++;
            if (iterations > maxIterations) return null;

            const currentId = openHeap.pop();
            if (currentId === undefined) break;

            if (cache_visited[currentId] === 1) continue;
            cache_visited[currentId] = 1;

            if (possibleEnds.has(currentId)) {
                foundEndId = currentId;
                break;
            }

            const currentG = cache_costs[currentId]!;
            const neighbors = adjacency.get(currentId);
            if (!neighbors) continue;

            const cLng = flatCoords[currentId * 2]!;
            const cLat = flatCoords[currentId * 2 + 1]!;
            const prevId = cache_previous[currentId]!;

            for (let i = 0; i < neighbors.length; i++) {
                const edge = neighbors[i]!;
                const neighborId = edge.to;

                if (cache_visited[neighborId] === 1) continue;

                let stepCost = edge.weight || 1;

                const nLng = flatCoords[neighborId * 2]!;
                const nLat = flatCoords[neighborId * 2 + 1]!;

                if (currentId === start && startHeading !== null) {
                    if (startType === "yard") {
                        stepCost += 10;
                    } else {
                        const dir = getBearing([cLng, cLat], [nLng, nLat]);
                        const diff = getAngleDiff(startHeading, dir);
                        if (diff > 90) stepCost += 10_000_000;
                        else if (diff > 45) stepCost += 1000;
                    }
                } else if (prevId !== -1) {
                    let pLng = flatCoords[prevId * 2]!;
                    let pLat = flatCoords[prevId * 2 + 1]!;

                    const distToPrev = fastDistKm(pLng, pLat, cLng, cLat);

                    if (distToPrev < 0.005) {
                        const grandPrevId = cache_previous[prevId]!;
                        if (grandPrevId !== -1) {
                            pLng = flatCoords[grandPrevId * 2]!;
                            pLat = flatCoords[grandPrevId * 2 + 1]!;
                        }
                    }

                    const angle = getSignedAngle(
                        [pLng, pLat],
                        [cLng, cLat],
                        [nLng, nLat]
                    );
                    const absAngle = Math.abs(angle);

                    // ===== BLOCKING U-TURN

                    const immPLng = flatCoords[prevId * 2]!;
                    const immPLat = flatCoords[prevId * 2 + 1]!;

                    const distFromImm = fastDistKm(
                        immPLng,
                        immPLat,
                        cLng,
                        cLat
                    );
                    const isZigZag = distFromImm < 0.2 && absAngle > 89;

                    if (isZigZag) stepCost += 1_000_000_000;

                    // BLOCKING U-TURN =====

                    if (edge.r === 2) {
                        stepCost *= 1.1;
                        if (angle < -100) stepCost += 100_000;
                    }

                    if (absAngle > 98) stepCost += Infinity;
                    else if (angle < -45) stepCost += 2000;
                    else if (angle > 45) stepCost += 500;
                    else if (absAngle > 10) stepCost += 50;
                }

                if (stepCost < 1) stepCost = 1;
                const tentativeG = currentG + stepCost;

                if (tentativeG < cache_costs[neighborId]!) {
                    cache_previous[neighborId] = currentId;
                    cache_costs[neighborId] = tentativeG;
                    openHeap.push(
                        neighborId,
                        tentativeG + getHeuristic(neighborId)
                    );
                }
            }
        }

        // ... (Return logic remains same)
        if (foundEndId === null) return null;

        const path: [number, number][] = [];
        let curr: number = foundEndId;

        while (curr !== -1) {
            path.unshift([flatCoords[curr * 2]!, flatCoords[curr * 2 + 1]!]);
            curr = cache_previous[curr]!;
            if (path.length > 20000) break;
        }

        return { path, endId: foundEndId };
    };

    return { calculateRoute, mergeClosePoints };
}
