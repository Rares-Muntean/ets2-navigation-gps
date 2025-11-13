import type { Map } from "leaflet";
import type L from "leaflet";
import { ETS_CONFIG } from "~~/shared/variables";

export function ets2ToLeaflet(
    map: Map,
    gameX: number,
    gameZ: number,
    {
        scale = ETS_CONFIG.SCALE,
        offsetX = ETS_CONFIG.OFFSET_X,
        offsetY = ETS_CONFIG.OFFSET_Y,
        invertY = ETS_CONFIG.INVERT_Y,
    }: {
        scale?: number;
        offsetX?: number;
        offsetY?: number;
        invertY?: boolean;
    } = {}
): L.LatLng {
    const px = gameX / scale + offsetX;
    let py = gameZ / scale + offsetY;

    if (invertY) {
        const imageHeight =
            ETS_CONFIG.EAST_PIXELS_HEIGHT ?? ETS_CONFIG.SOUTH_PIXELS_HEIGHT;
        py = imageHeight - py;
    }

    return (map as any).unproject([px, py], ETS_CONFIG.TILESET_MAX_ZOOM);
}
