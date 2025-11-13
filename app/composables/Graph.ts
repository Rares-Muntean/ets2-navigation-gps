import type { Node } from "~~/shared/types/GraphTypes/Node";
import type { GeojsonData } from "~~/shared/types/GeoJsonTypes/GeojsonData";
import type { Road } from "~~/shared/types/GeoJsonTypes/Road";

export type Point = [number, number];

export class Graph {
    private nodes: Map<string, Node> = new Map();

    getNode(key: string): Node | undefined {
        return this.nodes.get(key);
    }

    private makekey(lng: number, lat: number) {
        return `${lng.toFixed(6)},${lat.toFixed(6)}`;
    }

    addNode(lng: number, lat: number) {
        const key = this.makekey(lng, lat);
        if (!this.nodes.has(key)) this.nodes.set(key, { lat, lng, edges: [] });
        return key;
    }

    addEdge(a: Point, b: Point) {
        const keyA = this.addNode(a[0], a[1]);
        const keyB = this.addNode(b[0], b[1]);
        const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);

        this.nodes.get(keyA)!.edges.push({ to: keyB, weight: distance });
        this.nodes.get(keyB)!.edges.push({ to: keyA, weight: distance });
    }

    buildGraph(data: GeojsonData) {
        data.features.forEach((feature: Road) => {
            feature.geometry.coordinates.forEach((line: Point[]) => {
                for (let i = 0; i < line.length; i++) {
                    const [lng, lat] = line[i]!;
                    this.addNode(lng, lat);
                    if (i > 0) this.addEdge(line[i - 1]!, line[i]!);
                }
            });
        });
    }

    snapToGraph(lat: number, lng: number) {
        let nearestKey = null;
        let minDistance = Infinity;

        this.nodes.forEach((node, key) => {
            const distance = Math.hypot(lat - node.lat, lng - node.lng);
            if (distance < minDistance) {
                minDistance = distance;
                nearestKey = key;
            }
        });

        return nearestKey;
    }

    dijkstra(startKey: string, endKey: string) {
        const distances: Record<string, number> = {};
        const previous: Record<string, string | null> = {};
        const queue = new Set(this.nodes.keys());

        this.nodes.forEach((_, key) => {
            distances[key] = Infinity;
            previous[key] = null;
        });

        distances[startKey] = 0;

        while (queue.size) {
            let currentKey = "";
            let minDistance = Infinity;
            queue.forEach((key) => {
                if (distances[key]! < minDistance) {
                    minDistance = distances[key]!;
                    currentKey = key;
                }
            });

            if (!currentKey || currentKey === endKey) break;
            queue.delete(currentKey);

            const node = this.nodes.get(currentKey);
            node?.edges.forEach((edge) => {
                if (!this.nodes.has(edge.to)) return;
                const alt = distances[currentKey]! + edge.weight;
                if (alt < distances[edge.to]!) {
                    distances[edge.to] = alt;
                    previous[edge.to] = currentKey;
                }
            });
        }

        const path: Point[] = [];
        let pathNodeKey = endKey;
        while (pathNodeKey) {
            const nodePath = this.nodes.get(pathNodeKey)!;
            if (!nodePath) break;
            path.unshift([nodePath.lat, nodePath.lng]);
            pathNodeKey = previous[pathNodeKey]!;
        }

        return path;
    }
}
