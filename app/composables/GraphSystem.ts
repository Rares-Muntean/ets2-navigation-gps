import RBush from "rbush";
import { loadGraph } from "~/assets/utils/clientGraph";
import { haversine } from "~/assets/utils/helpers";

interface NodeIndexItem {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    id: number;
    coord: [number, number];
}

const adjacency = new Map<
    number,
    { to: number; weight: number; r: number }[]
>();
const nodeCoords = new Map<number, [number, number]>();
const nodeTree = new RBush<NodeIndexItem>();

export function useGraphSystem() {
    const loading = ref(true);
    const progress = ref(0);

    let rawNodesForWorker: any[] = [];
    let rawEdgesForWorker: any[] = [];

    const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

    function getClosestNodes(
        target: [number, number],
        limit = 5,
        radiusDeg = 0.02
    ): number[] {
        const radius = radiusDeg;

        const candidates = nodeTree.search({
            minX: target[0] - radius,
            minY: target[1] - radius,
            maxX: target[0] + radius,
            maxY: target[1] + radius,
        });

        if (candidates.length === 0) return [];

        const sorted = candidates
            .map((item) => ({
                id: item.id,
                dist: haversine(target, item.coord),
            }))
            .sort((a, b) => a.dist - b.dist);

        return sorted.slice(0, limit).map((c) => c.id);
    }

    const initializeGraphData = async () => {
        if (adjacency.size > 0) {
            loading.value = false;
            progress.value = 100;

            const existingNodes = Array.from(nodeCoords.entries());

            const existingEdges: any[] = [];
            for (const [from, neighbors] of adjacency.entries()) {
                for (const edge of neighbors) {
                    existingEdges.push({
                        from,
                        to: edge.to,
                        w: edge.weight,
                        r: edge.r,
                    });
                }
            }

            return { nodes: existingNodes, edges: existingEdges };
        }

        loading.value = true;
        progress.value = 0;

        const ghostInterval = setInterval(() => {
            if (progress.value < 85) {
                progress.value += Math.floor(Math.random() * 3) + 1;
            }
        }, 200);

        try {
            const { nodes, edges } = await loadGraph();

            rawNodesForWorker = nodes.map((n) => [n.id, [n.lng, n.lat]]);
            rawEdgesForWorker = edges;

            if (progress.value < 50) progress.value = 50;
            await sleep(200);

            adjacency.clear();
            nodeCoords.clear();
            nodeTree.clear();

            const spatialIndex = new Map<string, number>();
            const idRedirect = new Map<number, number>();
            const uniqueNodes: any[] = [];

            for (const node of nodes) {
                const key = `${node.lat.toFixed(5)},${node.lng.toFixed(5)}`;

                if (spatialIndex.has(key)) {
                    const masterId = spatialIndex.get(key)!;
                    idRedirect.set(node.id, masterId);
                } else {
                    spatialIndex.set(key, node.id);
                    idRedirect.set(node.id, node.id);
                    nodeCoords.set(node.id, [node.lng, node.lat]);
                    adjacency.set(node.id, []);
                    uniqueNodes.push(node);
                }
            }

            buildNodeIndex(uniqueNodes);

            for (const edge of edges) {
                const from = idRedirect.get(edge.from);
                const to = idRedirect.get(edge.to);
                if (from !== undefined && to !== undefined && from !== to) {
                    if (nodeCoords.has(from) && nodeCoords.has(to)) {
                        adjacency
                            .get(from)
                            ?.push({ to: to, weight: edge.w, r: edge.r || 0 });
                    }
                }
            }

            progress.value = 100;
            await sleep(200);
        } catch (err) {
            console.log("Loading Graph Failed", err);
        } finally {
            clearInterval(ghostInterval);
            setTimeout(() => {
                loading.value = false;
            }, 1000);
        }

        return { edges: rawEdgesForWorker, nodes: rawNodesForWorker };
    };

    return {
        loading,
        progress,
        adjacency,
        nodeCoords,
        getClosestNodes,
        initializeGraphData,
    };
}

function buildNodeIndex(nodes: { id: number; lng: number; lat: number }[]) {
    const items: NodeIndexItem[] = nodes.map((n) => ({
        minX: n.lng,
        minY: n.lat,
        maxX: n.lng,
        maxY: n.lat,
        id: n.id,
        coord: [n.lng, n.lat],
    }));

    nodeTree.load(items);
}
