import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "com.raresmuntean.trucknav",
    appName: "TruckNav",
    webDir: ".output/public",
    server: { androidScheme: "http" },
    plugins: {
        CapacitorHttp: {
            enabled: true,
        },
    },
};

export default config;
