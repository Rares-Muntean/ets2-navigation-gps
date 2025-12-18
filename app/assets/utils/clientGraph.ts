type PackedNode = [number, number];
type PackedEdge = [number, number, number, number];

export async function loadGraph() {
    const [packedNodes, packedEdges] = await Promise.all([
        fetch("/debug-roadnetwork/nodes.mp3").then(
            (r) => r.json() as Promise<PackedNode[]>
        ),
        fetch("/debug-roadnetwork/edges.mp3").then(
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
