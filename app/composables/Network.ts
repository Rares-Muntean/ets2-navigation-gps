export const useNetwork = () => {
    const localIP = ref<string>("");

    const fetchIp = async () => {
        if ((window as any).electronAPI) {
            localIP.value = await (window as any).electronAPI.getLocalIP();
        } else {
            localIP.value = "127.0.0.1";
        }
    };

    return {
        localIP,
        fetchIp,
    };
};
