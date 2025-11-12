export type RoadProps = { id: number; oneway: boolean; isHighway: boolean };

export type Point = [number, number];

export type Coordinates = Point[][];

export type Geometry = {
    type: string;
    coordinates: Coordinates;
};

export interface Road {
    type: string;
    properties: RoadProps;
    geometry: Geometry;
}
