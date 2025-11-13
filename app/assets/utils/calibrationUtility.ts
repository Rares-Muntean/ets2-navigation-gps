import type { Map as LeafletMap } from "leaflet";
import L from "leaflet";
import { ets2ToLeaflet } from "./mapUtility";

export function calibrateMap(
    map: LeafletMap,
    gameX: number,
    gameZ: number,
    expectedPixel: [number, number],
    variables: {
        scale: number;
        offsetX: number;
        offsetY: number;
        invertY: boolean;
        TILESET_MAX_ZOOM: number;
    }
) {
    const zoom = variables.TILESET_MAX_ZOOM || 9;
    const actualLatLng = ets2ToLeaflet(map, gameX, gameZ, variables);
    const actualPixel = map.project(actualLatLng, zoom);
    const expected = L.point(expectedPixel[0], expectedPixel[1]);
    const delta = expected.subtract(actualPixel);

    variables.offsetX += delta.x;
    variables.offsetY += delta.y;

    return {
        newLatLng: ets2ToLeaflet(map, gameX, gameZ, variables),
        delta,
        newOffsets: { x: variables.offsetX, y: variables.offsetY },
    };
}
