import { Capacitor } from "@capacitor/core";

export const usePlatform = () => {
    const isElectron = ref(false);
    const isMobile = ref(false);
    const isWeb = ref(false);

    if (typeof window !== "undefined") {
        const platform = Capacitor.getPlatform();

        if (platform === "web") isWeb.value = true;
        if (platform === "electron") isElectron.value = true;
        if (platform === "android" || platform === "ios") isMobile.value = true;
    }

    return {
        isElectron,
        isMobile,
        isWeb,
    };
};
