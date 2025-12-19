require("./rt/electron-rt");
//////////////////////////////
// User Defined Preload scripts below
console.log("User Preload!");

import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
    onServerIp: (callback: (ip: string) => void) =>
        ipcRenderer.on("server-ip", (_event, value) => callback(value)),
});
