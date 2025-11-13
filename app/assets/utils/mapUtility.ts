import type { Map } from "leaflet";
import type L from "leaflet";
import * as Variable from "~~/shared/variables";

export function ets2ToLeaflet(
    map: Map,
    gameX: number,
    gameZ: number,
    {
        scale = Variable.ETS_SCALE,
        offsetX = Variable.ETS_OFFSET_X,
        offsetY = Variable.ETS_OFFSET_Y,
        invertY = Variable.ETS_INVERT_Y,
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
            Variable.EAST_PIXELS_HEIGHT ?? Variable.SOUTH_PIXELS_HEIGHT;
        py = imageHeight - py;
    }

    return (map as any).unproject([px, py], Variable.TILESET_MAX_ZOOM);
}
