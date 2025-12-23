export class BlobSource {
    blob: Blob;
    key: string;

    constructor(blob: Blob, key: string) {
        this.blob = blob;
        this.key = key;
    }

    async getBytes(offset: number, length: number) {
        const slice = this.blob.slice(offset, offset + length);
        const arrayBuffer = await slice.arrayBuffer();
        return { data: arrayBuffer };
    }

    getKey() {
        return this.key;
    }
}
