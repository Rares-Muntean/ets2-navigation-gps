/**
 * scripts/buildGraph.ts
 *
 * Usage:
 *   npx ts-node app/scripts/buildGraph.ts ./public/geojson/roadnetwork.geojson ./public/roadnetwork
 *
 *
 * - This script:
 *   * builds an rbush boundingbox of features to find intersecting lines
 *   * uses turf.lineIntersect to find intersection points between nearby features
 *   * splits each LineString into multiple points and segments. (0,3),(3, 2) turns into (0,3) -> (3,2)
 *   * sorts split points along the line (using turf.nearestPointOnLine .properties.location)
 *   * creates three files that replace the roadnetwork geojson for better performance.
 *
 * - TL;DR:
 *   * Builds a graph from a geojson containing LineStrings.
 */

import {
    createWriteStream,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "fs";
import RBush from "rbush";
import * as turf from "@turf/turf";
import path from "path";
import type { Node, Edge, Coord } from "../../shared/types";
import { haversine } from "../assets/utils/helpers.ts";

interface InputFeature {
    type: "Feature";
    properties: Record<string, any>;
    geometry: {
        type: "LineString";
        coordinates: Coord[];
    };
}

interface InputGeoJSON {
    type: "FeatureCollection";
    features: InputFeature[];
}

interface BBoxItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    idx: number;
}

const roadTypeMap = { local: 0, freeway: 1, divided: 2, roundabout: 3 };

const COORD_MAX_DECIMALS = 6;
function coordKey(c: Coord) {
    return `${c[0].toFixed(COORD_MAX_DECIMALS)},${c[1].toFixed(
        COORD_MAX_DECIMALS
    )}`;
}

function readGeojson(inputDir: string): InputGeoJSON {
    const raw = readFileSync(inputDir, "utf8");
    const geo = JSON.parse(raw) as InputGeoJSON;

    return geo;
}

function createBbox(features: InputFeature[]) {
    const tree = new RBush<BBoxItem>();
    const bboxes: Array<[number, number, number, number]> = new Array(
        features.length
    ); // minX, minY, maxX, maxY

    // Foreach feature (road) create a bounding box
    for (let i = 0; i < features.length; i++) {
        const bbox = turf.bbox(features[i] as any);
        bboxes[i] = bbox as [number, number, number, number];
        tree.insert({
            minX: bbox[0],
            minY: bbox[1],
            maxX: bbox[2],
            maxY: bbox[3],
            idx: i,
        });
    }

    return { tree, bboxes };
}

function storeFeaturePoints(features: InputFeature[]) {
    const splitPointsToMap: Map<number, Set<string>> = new Map();
    for (let i = 0; i < features.length; i++)
        splitPointsToMap.set(i, new Set());

    for (let i = 0; i < features.length; i++) {
        const coords = features[i]?.geometry.coordinates;
        if (coords?.length) {
            for (let j = 0; j < coords.length; j++) {
                splitPointsToMap.get(i)?.add(coordKey(coords[j]!));
            }
        }
    }

    //// This connects highway ramps and roundabouts that aren't perfectly drawn
    console.log("Injecting intersections for connectivity...");

    const tree = new RBush<BBoxItem>();
    for (let i = 0; i < features.length; i++) {
        const bbox = turf.bbox(features[i] as any);
        tree.insert({
            minX: bbox[0],
            minY: bbox[1],
            maxX: bbox[2],
            maxY: bbox[3],
            idx: i,
        });
    }

    const injectPoint = (pt: Coord, sourceIdx: number, isStart: boolean) => {
        const searchDistDeg = 0.0002;
        const candidates = tree.search({
            minX: pt[0] - searchDistDeg,
            minY: pt[1] - searchDistDeg,
            maxX: pt[0] + searchDistDeg,
            maxY: pt[1] + searchDistDeg,
        });

        for (const item of candidates) {
            if (item.idx === sourceIdx) continue;

            const candidateLine = features[item.idx];
            const pointGeo = turf.point(pt);

            const snapped = turf.nearestPointOnLine(
                candidateLine as any,
                pointGeo,
                { units: "kilometers" }
            );

            // If it's close enough (< 5 meters), force a connection
            if (
                snapped.properties.dist !== undefined &&
                snapped.properties.dist < 0.005
            ) {
                const snapCoord = snapped.geometry.coordinates as Coord;

                splitPointsToMap.get(item.idx)?.add(coordKey(snapCoord));

                if (isStart) {
                    features[sourceIdx].geometry.coordinates[0] = snapCoord;
                } else {
                    const len = features[sourceIdx].geometry.coordinates.length;
                    features[sourceIdx].geometry.coordinates[len - 1] =
                        snapCoord;
                }

                splitPointsToMap.get(sourceIdx)?.add(coordKey(snapCoord));
            }
        }
    };

    for (let i = 0; i < features.length; i++) {
        const coords = features[i].geometry.coordinates;
        if (!coords || coords.length < 2) continue;
        injectPoint(coords[0], i, true); // Connect Start
        injectPoint(coords[coords.length - 1], i, false); // Connect End
    }

    return splitPointsToMap;
}

/* Creates a line from features that gets simplified ->
-> from all the points that are `splitting` the line we create an array ->
-> we create another array containing the point coords and the distance from the coords[0] (start) of the line ->
-> by doing so we will compare the distances and make sure that when we split the points into segments they are in order ->
-> because there is a chance that in the line we havent stored the start or end key, we verify that and add them if they are not already there. ->
-> sort the pointsWithDIstance in order. ->
-> we cleanup the nodes (if some are very close to eachother) -> 
-> we create nodes for each point with distance that is ordered ->
-> we create edges from node to node + 1.
*/

function createLinePointsArray(
    feature: InputFeature,
    splitPointsToMap: Map<number, Set<string>>,
    i: number
) {
    let line = turf.lineString(feature?.geometry.coordinates);

    const ptsSet = splitPointsToMap.get(i)!;
    const ptsArr: Coord[] = Array.from(ptsSet).map((set) => {
        const [xStr, yStr] = set.split(",");
        const x = Number(xStr);
        const y = Number(yStr);
        return [x, y];
    });

    return { line, ptsSet, ptsArr };
}

function createPointsWithDistance(
    ptsSet: Set<string>,
    ptsArr: Coord[],
    line: any,
    feature: InputFeature
) {
    const pointsWithDistance: Array<{ coord: Coord; locKm: number }> = [];
    for (const coord of ptsArr) {
        const pt = turf.point(coord);

        try {
            const res = turf.nearestPointOnLine(
                line as any,
                pt as any,
                { units: "kilometers" } as any
            );

            const locKm =
                res &&
                res.properties &&
                typeof res.properties.location === "number"
                    ? res.properties.location
                    : 0;
            pointsWithDistance.push({ coord, locKm });
        } catch {
            const approx =
                haversine(feature.geometry.coordinates[0]!, coord) / 1000;
            pointsWithDistance.push({ coord, locKm: approx });
        }
    }

    //// Make sure the start and the end of the lines are included in the pointsWDIstances
    const start = feature.geometry.coordinates[0]!;
    const end =
        feature.geometry.coordinates[feature.geometry.coordinates.length - 1]!;

    if (!ptsSet.has(coordKey(start))) {
        const res = turf.nearestPointOnLine(
            line as any,
            turf.point(start) as any,
            { units: "kilometers" }
        );

        pointsWithDistance.push({
            coord: start,
            locKm: res.properties.location ?? 0,
        });
    }

    if (!ptsSet.has(coordKey(end))) {
        const res = turf.nearestPointOnLine(
            line as any,
            turf.point(end) as any,
            { units: "kilometers" }
        ) as any;
        pointsWithDistance.push({
            coord: end,
            locKm: res?.properties?.location ?? 0,
        });
    }

    return pointsWithDistance;
}

//// CLEANUP IF POINTS ARE TOO CLOSE TO EACHOTHER (OPTIONAL)
function cleanUpPoints(pointsWithDistance: { coord: Coord; locKm: number }[]) {
    const cleaned: Coord[] = [];
    let lastLoc = -1;
    for (const item of pointsWithDistance) {
        if (Math.abs(item.locKm - lastLoc) < 1e-6) continue;
        cleaned.push(item.coord);
        lastLoc = item.locKm;
    }

    return cleaned;
}

//// PROCESS POINTS AND LINES AND CREATE NODES AND EDGES
function toRad(deg: number) {
    return (deg * Math.PI) / 180;
}
function toDeg(rad: number) {
    return (rad * 180) / Math.PI;
}

function getBearing(start: Coord, end: Coord) {
    const startLat = toRad(start[1]);
    const startLng = toRad(start[0]);
    const endLat = toRad(end[1]);
    const endLng = toRad(end[0]);

    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x =
        Math.cos(startLat) * Math.sin(endLat) -
        Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
    const brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
}

function createNodesAndEdges(
    features: InputFeature[],
    splitPointsToMap: Map<number, Set<string>>
) {
    // 1. SETUP
    interface NodeItem {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        id: number;
        coord: Coord;
    }
    const nodeTree = new RBush<NodeItem>();
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const nodeMap = new Map<string, number>();

    // Store Topology: NodeID -> List of connected features
    const nodeTopology = new Map<
        number,
        { fIdx: number; isStart: boolean; bearing: number }[]
    >();

    function getOrCreateNodeId(coord: Coord): number {
        const k = coordKey(coord);
        const existingExact = nodeMap.get(k);
        if (existingExact !== undefined) return existingExact;

        const toleranceDeg = 0.000005; // ~0.5m
        const candidates = nodeTree.search({
            minX: coord[0] - toleranceDeg,
            minY: coord[1] - toleranceDeg,
            maxX: coord[0] + toleranceDeg,
            maxY: coord[1] + toleranceDeg,
        });

        for (const c of candidates) {
            if (haversine(coord, c.coord) < 0.5) {
                nodeMap.set(k, c.id);
                return c.id;
            }
        }
        const id = nodes.length;
        const lng = Number(coord[0].toFixed(COORD_MAX_DECIMALS));
        const lat = Number(coord[1].toFixed(COORD_MAX_DECIMALS));
        nodes.push({ id, lng, lat });
        nodeTree.insert({
            minX: lng,
            minY: lat,
            maxX: lng,
            maxY: lat,
            id: id,
            coord: [lng, lat],
        });
        nodeMap.set(k, id);
        return id;
    }

    const processedFeatures: any[] = new Array(features.length);

    console.log("Pass 1: Analysis...");
    for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        if (
            !feature?.geometry.coordinates ||
            feature.geometry.coordinates.length < 2
        )
            continue;

        const result = createLinePointsArray(feature, splitPointsToMap, i);
        if (!result) continue;

        const { line, ptsSet, ptsArr } = result;
        const pointsWithDistance = createPointsWithDistance(
            ptsSet,
            ptsArr,
            line,
            feature
        );
        pointsWithDistance.sort((a, b) => a.locKm - b.locKm);
        const cleaned = cleanUpPoints(pointsWithDistance);

        if (cleaned.length > 1) {
            processedFeatures[i] = cleaned;

            const startNodeId = getOrCreateNodeId(cleaned[0]);
            const endNodeId = getOrCreateNodeId(cleaned[cleaned.length - 1]);

            const startBearing = getBearing(cleaned[0], cleaned[1]);
            const endBearing = getBearing(
                cleaned[cleaned.length - 2],
                cleaned[cleaned.length - 1]
            );

            if (!nodeTopology.has(startNodeId))
                nodeTopology.set(startNodeId, []);
            nodeTopology
                .get(startNodeId)!
                .push({ fIdx: i, isStart: true, bearing: startBearing });

            if (!nodeTopology.has(endNodeId)) nodeTopology.set(endNodeId, []);
            nodeTopology
                .get(endNodeId)!
                .push({ fIdx: i, isStart: false, bearing: endBearing });
        }
    }

    console.log("Pass 2: Topology Inference...");
    const directionInference = new Int8Array(features.length);
    for (let i = 0; i < features.length; i++) {
        if (!processedFeatures[i]) continue;
        const pts = processedFeatures[i];

        const startNodeId = getOrCreateNodeId(pts[0]);
        const endNodeId = getOrCreateNodeId(pts[pts.length - 1]);

        const myStartBearing = getBearing(pts[0], pts[1]);
        const myEndBearing = getBearing(
            pts[pts.length - 2],
            pts[pts.length - 1]
        );

        let forwardVotes = 0;
        let backwardVotes = 0;

        const startNeighbors = nodeTopology.get(startNodeId) || [];
        for (const n of startNeighbors) {
            if (n.fIdx === i) continue;
            let angleDiff = Math.abs(n.bearing - myStartBearing);
            if (angleDiff > 180) angleDiff = 360 - angleDiff;

            // If neighbor Ends here (isStart=false) and aligns < 60 deg, it feeds us
            if (n.isStart === false && angleDiff < 60) forwardVotes++;
            // If neighbor Starts here and aligns, it feeds backwards
            if (n.isStart === true && angleDiff < 60) backwardVotes++;
        }

        const endNeighbors = nodeTopology.get(endNodeId) || [];
        for (const n of endNeighbors) {
            if (n.fIdx === i) continue;
            let angleDiff = Math.abs(n.bearing - myEndBearing);
            if (angleDiff > 180) angleDiff = 360 - angleDiff;

            // If neighbor Starts here (isStart=true) and aligns < 60 deg, we feed it
            if (n.isStart === true && angleDiff < 60) forwardVotes++;
            // If neighbor Ends here and aligns, we feed it backwards
            if (n.isStart === false && angleDiff < 60) backwardVotes++;
        }

        if (forwardVotes > backwardVotes) directionInference[i] = 1;
        else if (backwardVotes > forwardVotes) directionInference[i] = -1;
        else directionInference[i] = 0;
    }

    console.log("Pass 3: Generating Edges...");
    for (let i = 0; i < features.length; i++) {
        if (!processedFeatures[i]) continue;
        const cleaned = processedFeatures[i];
        const feature = features[i];
        const props = feature.properties || {};

        const isRoundabout = props.roadType === "roundabout";
        const isFreeway =
            props.roadType === "freeway" || props.roadType === "divided";
        const inferredDir = directionInference[i];
        const isManualFix = props.roadType === "manual";

        // --- SEGMENT LOOP ---
        for (let point = 0; point < cleaned.length - 1; point++) {
            const startCoord = cleaned[point];
            const endCoord = cleaned[point + 1];
            const firstFromPair = getOrCreateNodeId(startCoord);
            const secondFromPair = getOrCreateNodeId(endCoord);

            if (firstFromPair === secondFromPair) continue;

            const distance = haversine(startCoord, endCoord);
            if (distance <= 0) continue;

            let forwardWeight = distance;
            let backwardWeight = distance;

            const PENALTY_FLAT = 300;
            const STRICT_BLOCK = Infinity;

            // === LOGIC TIER ===
            if (isRoundabout) {
                backwardWeight = STRICT_BLOCK;
            } else if (isManualFix) {
                backwardWeight = STRICT_BLOCK;
            } else if (isFreeway) {
                // Combine Lane Data + Topology Inference
                if (inferredDir === 1) {
                    backwardWeight = distance + PENALTY_FLAT;
                } else if (inferredDir === -1) {
                    forwardWeight = distance + PENALTY_FLAT;
                }
            }

            if (forwardWeight !== Infinity) {
                edges.push({
                    from: firstFromPair,
                    to: secondFromPair,
                    w: Math.round(forwardWeight * 10) / 10,
                    r: roadTypeMap[props.roadType] || 0,
                });
            }
            if (backwardWeight !== Infinity) {
                edges.push({
                    from: secondFromPair,
                    to: firstFromPair,
                    w: Math.round(forwardWeight * 10) / 10,
                    r: roadTypeMap[props.roadType] || 0,
                });
            }
        }
    }

    return { nodes, edges };
}

//// SAVES THE NODES.JSON AND EDGES.JSON TO DISK
function saveFilesToDisk(outDir: any, nodes: Node[], edges: Edge[]) {
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const packedNodes = nodes.map((n) => [
        Math.round(n.lat * 1e5),
        Math.round(n.lng * 1e5),
    ]);
    const packedEdges = edges.map((e) => [e.from, e.to, e.w, e.r]);

    writeFileSync(path.join(outDir, "nodes.json"), JSON.stringify(packedNodes));
    writeFileSync(path.join(outDir, "edges.json"), JSON.stringify(packedEdges));

    console.log(`Saved ${nodes.length} nodes and ${edges.length} edges.`);
}

//// BUILD GRAPH
function buildGraph(inputDir: string, outDir: string) {
    let splitPointsToMap: Map<number, Set<string>>;

    console.log("Loading GeoJSON: ", inputDir);
    const geo = readGeojson(inputDir);
    let features = geo.features;
    // const countBefore = features.length;

    features = features
        .filter((f) => {
            if (!f.geometry || !f.geometry.coordinates) return false;
            if (f.geometry.coordinates.length < 2) return false;
            return true;
        })
        .map((f, index) => {
            if (!f.properties) f.properties = {};

            if (!f.properties.roadType) f.properties.roadType = "local";

            return f;
        });

    console.log("Detecting intersection points between bbox neighbors...");
    splitPointsToMap = storeFeaturePoints(features);

    console.log("Collected intersection points. Now building nodes & edges...");
    const { nodes, edges } = createNodesAndEdges(features, splitPointsToMap);

    saveFilesToDisk(outDir, nodes, edges);
    console.log("Graph saved to:", outDir);
    console.log("Process finished!");
}

// Main call
async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error(
            "Usage: npx ts-node app/scripts/buildGraph.ts <input.geojson> <outDir>"
        );
        process.exit(1);
    }
    const [inputPath, outDir] = args;
    await buildGraph(inputPath!, outDir!);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
