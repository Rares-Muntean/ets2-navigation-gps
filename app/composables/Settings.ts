import { Preferences } from "@capacitor/preferences";

export const useSettings = () => {
    const savedIP = ref<string | null>(null);

    const saveIP = async (ip: string) => {
        await Preferences.set({ key: "pc_ip", value: ip });
        savedIP.value = ip;
    };

    const loadIP = async () => {
        const { value } = await Preferences.get({ key: "pc_ip" });
        savedIP.value = value;
        return value;
    };

    loadIP();

    const clearIP = async () => {
        await Preferences.remove({ key: "pc_ip" });
        savedIP.value = null;
    };

    return { savedIP, saveIP, loadIP, clearIP };
};
