type PackedNode = [number, number];
type PackedEdge = [number, number, number, number];

import { Capacitor } from "@capacitor/core";

const extenstion = Capacitor.isNativePlatform() ? "mp3" : "json";

export async function loadGraph() {
    const [packedNodes, packedEdges] = await Promise.all([
        fetch(`/debug-roadnetwork/nodes.${extenstion}`).then(
            (r) => r.json() as Promise<PackedNode[]>
        ),
        fetch(`/debug-roadnetwork/edges.${extenstion}`).then(
            (r) => r.json() as Promise<PackedEdge[]>
        ),
    ]);

    const nodes = packedNodes.map((n, index) => ({
        id: index,
        lat: n[0] / 1e5,
        lng: n[1] / 1e5,
    }));

    const edges = packedEdges.map((e) => ({
        from: e[0],
        to: e[1],
        w: e[2],
        r: e[3],
    }));

    return { nodes, edges };
}
