import { pointOnFeature } from "@turf/turf";

export class MinHeap {
    private ids: Int32Array;
    private costs: Float64Array;
    private length: number = 0;

    constructor(capacity: number = 50000) {
        this.ids = new Int32Array(capacity);
        this.costs = new Float64Array(capacity);
    }

    push(id: number, cost: number) {
        if (this.length >= this.ids.length) {
            this.resize();
        }

        this.ids[this.length] = id;
        this.costs[this.length] = cost;
        this.bubbleUp(this.length);
        this.length++;
    }

    pop(): number | undefined {
        if (this.length === 0) return undefined;

        const topId = this.ids[0];
        this.length--;

        if (this.length > 0) {
            this.ids[0] = this.ids[this.length]!;
            this.costs[0] = this.costs[this.length]!;
            this.bubbleDown(0);
        }

        return topId;
    }

    size() {
        return this.length;
    }

    clear() {
        return this.length;
    }

    private resize() {
        const newCap = this.ids.length * 2;
        const newIds = new Int32Array(newCap);
        const newCosts = new Float64Array(newCap);
        newIds.set(this.ids);
        newCosts.set(this.costs);
        this.ids = newIds;
        this.costs = newCosts;
    }

    private bubbleUp(index: number) {
        while (index > 0) {
            const parent = (index - 1) >>> 1;
            if (this.costs[index]! >= this.costs[parent]!) break;

            this.swap(index, parent);
            index = parent;
        }
    }

    private bubbleDown(index: number) {
        const last = this.length - 1;
        while (true) {
            const left = (index << 1) + 1;
            const right = left + 1;
            let smallest = index;

            if (left <= last && this.costs[left]! < this.costs[smallest]!) {
                smallest = left;
            }
            if (right <= last && this.costs[right]! < this.costs[smallest]!) {
                smallest = right;
            }
            if (smallest === index) break;

            this.swap(index, smallest);
            index = smallest;
        }
    }

    private swap(i: number, j: number) {
        const tempId = this.ids[i];
        const tempCost = this.costs[i];

        this.ids[i] = this.ids[j]!;
        this.costs[i] = this.costs[j]!;

        this.ids[j] = tempId!;
        this.costs[j] = tempCost!;
    }
}
