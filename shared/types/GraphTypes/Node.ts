import type { Edge } from "./Edge";

export interface Node {
    lat: number;
    lng: number;
    edges: Edge[];
}
