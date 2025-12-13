let adjacency: Map<number, any[]> | null = null;
let nodeCoords: Map<number, [number, number]> | null = null;

const { calculateRoute } = useRouting();

self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === "INIT_GRAPH") {
        // TODO: Fetch inside worker
        const { nodes, edges } = payload;

        nodeCoords = new Map(nodes);
        adjacency = new Map();

        for (const edge of edges) {
            if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
            adjacency.get(edge.from)!.push({
                to: edge.to,
                weight: edge.w,
                r: edge.r,
            });
        }

        self.postMessage({ type: "READY" });
    }

    if (type === "CALC_ROUTE") {
        if (!adjacency || !nodeCoords) return;

        const { startId, possibleEnds, heading, startType, targetCoords } =
            payload;

        const result = calculateRoute(
            startId,
            new Set(possibleEnds),
            heading,
            adjacency,
            nodeCoords,
            startType,
            targetCoords
        );

        self.postMessage({ type: "RESULT", payload: result });
    }
};
