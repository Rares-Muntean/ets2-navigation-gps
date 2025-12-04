import { defineEventHandler } from "h3";

export default defineEventHandler(async () => {
    try {
        const data = await $fetch("http://localhost:25555/api/ets2/telemetry");
        return data;
    } catch (error: any) {
        throw new Error(`Failed to fetch telemetry: ${error.message}`);
    }
});
