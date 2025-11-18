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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import RBush from "rbush";
import * as turf from "@turf/turf";
import path from "path";

type Coord = [number, number];

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

interface Node {
    id: number;
    lng: number;
    lat: number;
}

interface Edge {
    from: number;
    to: number;
    weight: number;
    featureId?: string | null;
    properties?: Record<string, any>;
}

interface BBoxItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    idx: number;
}

function haversine(a: Coord, b: Coord): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);

    const sin1 = Math.sin(dLat / 2);
    const sin2 = Math.sin(dLon / 2);
    const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

const COORD_MAX_DECIMALS = 6;
function coordKey(c: Coord) {
    return `${c[0].toFixed(COORD_MAX_DECIMALS)},${c[1].toFixed(
        COORD_MAX_DECIMALS
    )}`;
}

//// Reading GeoJSON
function readGeojson(inputDir: string): InputGeoJSON {
    const raw = readFileSync(inputDir, "utf8");
    const geo = JSON.parse(raw) as InputGeoJSON;

    return geo;
}

//// Creating Rbush bbox
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

//// Storing the first and the last points in a feature (road)
function storeFeaturePoints(features: InputFeature[]) {
    const splitPointsToMap: Map<number, Set<string>> = new Map();
    for (let i = 0; i < features.length; i++)
        splitPointsToMap.set(i, new Set());

    console.log(features[6]?.properties.roadType);
    for (let i = 0; i < features.length; i++) {
        const coords = features[i]?.geometry.coordinates;
        if (coords?.length) {
            // const first = coords[0];
            // const last = coords[coords.length - 1];
            // const middle = coords[Math.floor(coords.length / 2)];
            // if (first && last) {
            //     splitPointsToMap.get(i)?.add(coordKey(first));
            //     splitPointsToMap.get(i)?.add(coordKey(last));
            //     if (middle) {
            //         splitPointsToMap.get(i)?.add(coordKey(middle));
            //     }
            // }
            for (let j = 0; j < coords.length; j++) {
                if (j % 5 == 0) {
                    splitPointsToMap.get(i)?.add(coordKey(coords[j]!));
                }
            }
        }
    }

    return splitPointsToMap;
}

//// Get the bboxes that intersect with the current bbox, then check from that smaller area if they actually intersect.
function checkIntersectionsAndAdd(
    features: InputFeature[],
    bboxes: [number, number, number, number][],
    tree: RBush<BBoxItem>,
    splitPointsToMap: Map<number, Set<string>>
) {
    for (let i = 0; i < features.length; i++) {
        // if (i % 200 === 0)
        //     console.log(`Intersect pass feature ${i}/${features.length}`);

        const bbox = bboxes?.[i];
        if (bbox) {
            const item = tree.search({
                minX: bbox[0],
                minY: bbox[1],
                maxX: bbox[2],
                maxY: bbox[3],
            }) as BBoxItem[];

            for (const neighbor of item) {
                const j = neighbor.idx;
                if (j <= i) continue;

                const f1 = features[i];
                const f2 = features[j];
                try {
                    const intersection = turf.lineIntersect(
                        f1 as any,
                        f2 as any
                    );
                    if (intersection) {
                        for (const point of intersection.features) {
                            const coords = (point.geometry as any)
                                .coordinates as Coord;
                            const k = coordKey(coords);
                            splitPointsToMap.get(i)?.add(k);
                            splitPointsToMap.get(j)?.add(k);
                        }
                    }
                } catch (err) {
                    console.warn(
                        `lineIntersect failed for pair ${i} and ${j} - skipping...`,
                        (err as Error).message || err
                    );
                }
            }
        }
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
//// Creating lines and ptsArr
function createLinePointsArray(
    feature: InputFeature,
    splitPointsToMap: Map<number, Set<string>>,
    i: number
) {
    let line = turf.lineString(feature?.geometry.coordinates);
    line = turf.simplify(line, {
        tolerance: 0.001,
        highQuality: true,
    });

    const ptsSet = splitPointsToMap.get(i)!;
    const ptsArr: Coord[] = Array.from(ptsSet).map((set) => {
        const [xStr, yStr] = set.split(",");
        const x = Number(xStr);
        const y = Number(yStr);
        return [x, y];
    });

    return { line, ptsSet, ptsArr };
}

/// Creating points with distances
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

//// Cleanup pointsWithDistances if too close to eachother
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
function createNodesAndEdges(
    features: InputFeature[],
    splitPointsToMap: Map<number, Set<string>>
) {
    const nodeMap = new Map<string, number>(); // -> we will take use of coordKey and connect it to a nodeId
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    function getOrCreateNodeId(coord: Coord) {
        const k = coordKey(coord);
        const existing = nodeMap.get(k);
        if (existing !== undefined) return existing;
        const id = nodes.length;
        nodes.push({
            id,
            lng: Number(coord[0].toFixed(COORD_MAX_DECIMALS)),
            lat: Number(coord[1].toFixed(COORD_MAX_DECIMALS)),
        });
        nodeMap.set(k, id);

        return id;
    }

    for (let i = 0; i < features.length; i++) {
        if (i % 200 == 0)
            console.log(`Segmenting the feature ${i}/${features.length}`);

        const feature = features[i];
        if (feature?.geometry.coordinates) {
            const { line, ptsSet, ptsArr } = createLinePointsArray(
                feature,
                splitPointsToMap,
                i
            );

            const pointsWithDistance = createPointsWithDistance(
                ptsSet,
                ptsArr,
                line,
                feature
            );

            // Sort the points by distance
            pointsWithDistance.sort((a, b) => a.locKm - b.locKm);

            const cleaned = cleanUpPoints(pointsWithDistance);

            for (let point = 0; point < cleaned.length - 1; point++) {
                const firstFromPair = cleaned[point]!;
                const secondFromPair = cleaned[point + 1]!;

                const distance = haversine(firstFromPair, secondFromPair);
                if (distance < 0) continue;

                const idfirst = getOrCreateNodeId(firstFromPair);
                const idsecond = getOrCreateNodeId(secondFromPair);

                const eprops = {
                    featureId: feature.properties.id ?? null,
                    roadType: feature.properties.roadType ?? null,
                };

                edges.push({
                    from: idfirst,
                    to: idsecond,
                    weight: distance,
                    featureId: feature.properties?.id ?? null,
                    properties: eprops,
                });

                // For future: if oneway then skip this
                edges.push({
                    from: idsecond,
                    to: idfirst,
                    weight: distance,
                    featureId: feature.properties?.id ?? null,
                    properties: eprops,
                });
            }
        }
    }

    return { nodes, edges };
}

//// Saves the node.json and edges.json to the disk.
function saveFilesToDisk(
    outDir: any,
    nodes: Node[],
    edges: Edge[],
    features: InputFeature[]
) {
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    writeFileSync(path.join(outDir, "nodes.json"), JSON.stringify(nodes));
    writeFileSync(path.join(outDir, "edges.json"), JSON.stringify(edges));

    console.log("Nodes: ", nodes.length, "Edges:", edges.length);
    writeFileSync(
        path.join(outDir, "meta.json"),
        JSON.stringify({
            totalFeatures: features.length,
            totalNodes: nodes.length,
            totalEdges: edges.length,
            generatedAt: new Date().toISOString(),
        })
    );
}

//// BUILD GRAPH
function buildGraph(inputDir: string, outDir: string) {
    let splitPointsToMap: Map<number, Set<string>>;

    console.log("Loading GeoJSON: ", inputDir);
    const geo = readGeojson(inputDir);
    const features = geo.features;

    console.log("Building RBush tree bounding box for features...");
    const { tree, bboxes } = createBbox(features);

    console.log("Detecting intersection points between bbox neighbors...");
    splitPointsToMap = storeFeaturePoints(features);
    splitPointsToMap = checkIntersectionsAndAdd(
        features,
        bboxes,
        tree,
        splitPointsToMap
    );

    console.log("Collected intersection points. Now building nodes & edges...");
    const { nodes, edges } = createNodesAndEdges(features, splitPointsToMap);

    saveFilesToDisk(outDir, nodes, edges, features);
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
