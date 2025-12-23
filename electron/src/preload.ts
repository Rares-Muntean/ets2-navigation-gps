require("./rt/electron-rt");
//////////////////////////////
// User Defined Preload scripts below
console.log("User Preload!");

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
    onServerIp: (callback: (ip: string) => void) =>
        ipcRenderer.on("server-ip", (_event, value) => callback(value)),

    getLocalIP: () => ipcRenderer.invoke("get-local-ip"),

    openExternal: (url: string) => ipcRenderer.send("open-external", url),

    setWindowSize: (
        width: number,
        height: number,
        resizable: boolean,
        maximize: boolean
    ) =>
        ipcRenderer.send("set-window-size", {
            width,
            height,
            resizable,
            maximize,
        }),

    checkServerStatus: () => ipcRenderer.invoke("check-server-status"),
    manualStartServer: () => ipcRenderer.send("manual-start-server"),
    fetchTelemetry: (ip: string) => ipcRenderer.invoke("fetch-telemetry", ip),
});
