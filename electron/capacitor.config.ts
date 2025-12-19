import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "com.munteanrares.ets2gps",
    appName: "ETS2 Map Gps",
    webDir: ".output/public",
    server: { androidScheme: "http" },
    plugins: {
        CapacitorHttp: {
            enabled: true,
        },
    },
};

export default config;
