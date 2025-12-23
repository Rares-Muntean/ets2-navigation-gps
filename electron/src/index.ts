import type { CapacitorElectronConfig } from "@capacitor-community/electron";
import {
    getCapacitorElectronConfig,
    setupElectronDeepLinking,
} from "@capacitor-community/electron";
import type { MenuItemConstructorOptions } from "electron";
import { app, dialog, ipcMain, MenuItem, shell } from "electron";
import electronIsDev from "electron-is-dev";
import unhandled from "electron-unhandled";
import os from "os";

import {
    ElectronCapacitorApp,
    setupContentSecurityPolicy,
    setupReloadWatcher,
} from "./setup";
import path from "path";
import { exec, execSync, spawn } from "child_process";
import { existsSync, writeFileSync, writeSync } from "fs";

//
//
//
//// ======> CUSTOM FUNCTIONS <======
async function startTelemetryServer() {
    const exeName = "Ets2Telemetry.exe";
    const serverPath = app.isPackaged
        ? path.join(process.resourcesPath, "telemetry-server", exeName)
        : path.join(app.getAppPath(), "bin", "telemetry-server", exeName);

    if (!existsSync(serverPath)) {
        dialog.showErrorBox(
            "DEBUG: Path Error",
            `File NOT found at:\n${serverPath}`
        );
        return;
    }

    try {
        const running = execSync(
            `tasklist /FI "IMAGENAME eq ${exeName}" /NH`
        ).toString();
        if (running.toLowerCase().includes(exeName.toLowerCase())) return;
    } catch (e) {}

    const serverDir = path.dirname(serverPath);
    const flagPath = path.join(app.getPath("userData"), ".first-run-completed");
    const isFirstRun = !existsSync(flagPath);

    const style = isFirstRun ? "Normal" : "Minimized";

    const psCommand = `Start-Process -FilePath '${serverPath}' -WorkingDirectory '${serverDir}' -WindowStyle ${style}`;

    const logPath = path.join(os.homedir(), "Desktop", "truck-nav-debug.txt");
    writeFileSync(
        logPath,
        `Attempting to launch:\n${psCommand}\n\nPackaged: ${app.isPackaged}`
    );

    const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
        { shell: true }
    );

    child.stderr.on("data", (data) => {
        dialog.showErrorBox("POWERSHELL ERROR", data.toString());
    });

    if (isFirstRun) writeFileSync(flagPath, "done");
}

ipcMain.handle("get-local-ip", () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]!) {
            if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
            }
        }
    }
    return "127.0.0.1";
});

ipcMain.handle("fetch-telemetry", async (_event, ip) => {
    try {
        const response = await fetch(`http://${ip}:25555/api/ets2/telemetry`);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
});

ipcMain.on("open-external", (_event, url) => {
    shell.openExternal(url);
});

ipcMain.on(
    "set-window-size",
    (_event, { width, height, resizable, maximize }) => {
        const win = myCapacitorApp.getMainWindow();

        if (!maximize) {
            win.unmaximize();
            win.setResizable(true);
            win.setSize(width, height);
            win.setResizable(resizable);
            win.center();
        } else {
            win.setResizable(true);
            win.maximize();
        }
    }
);

ipcMain.handle("check-server-status", () => {
    const exeName = "Ets2Telemetry.exe";

    try {
        const runningProcesses = execSync(
            `tasklist /FI "IMAGENAME eq ${exeName}" /NH`
        ).toString();

        return runningProcesses.includes(exeName);
    } catch (err) {
        return false;
    }
});

ipcMain.on("manual-start-server", () => {
    startTelemetryServer();
});
//// ======> CUSTOM FUNCTIONS <======
//
//
//

// Graceful handling of unhandled errors.
unhandled();

// Define our menu templates (these are optional)
const trayMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
    new MenuItem({ label: "Quit App", role: "quit" }),
];
const appMenuBarMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
    { role: process.platform === "darwin" ? "appMenu" : "fileMenu" },
    { role: "viewMenu" },
];

// Get Config options from capacitor.config
const capacitorFileConfig: CapacitorElectronConfig =
    getCapacitorElectronConfig();

// Initialize our app. You can pass menu templates into the app here.
// const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);
const myCapacitorApp = new ElectronCapacitorApp(
    capacitorFileConfig,
    trayMenuTemplate,
    []
);

// If deeplinking is enabled then we will set it up here.
if (capacitorFileConfig.electron?.deepLinkingEnabled) {
    setupElectronDeepLinking(myCapacitorApp, {
        customProtocol:
            capacitorFileConfig.electron.deepLinkingCustomProtocol ??
            "mycapacitorapp",
    });
}

// If we are in Dev mode, use the file watcher components.
if (electronIsDev) {
    setupReloadWatcher(myCapacitorApp);
}

// Run Application
(async () => {
    // Wait for electron app to be ready.
    await app.whenReady();

    startTelemetryServer();

    // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
    setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
    // Initialize our app, build windows, and load content.
    await myCapacitorApp.init();
    // Check for updates if we are in a packaged app.
    // autoUpdater.checkForUpdatesAndNotify();
})();

// Handle when all of our windows are close (platforms have their own expectations).
app.on("window-all-closed", function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== "darwin") {
        app.quit();
    }
});

// When the dock icon is clicked.
app.on("activate", async function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (myCapacitorApp.getMainWindow().isDestroyed()) {
        await myCapacitorApp.init();
    }
});

// Place all ipc or other electron api calls and custom functionality under this line
