import type { GameType } from "~/types";

export type UnitSystem = "metric" | "imperial";
export type TextTheme = "light" | "dark";
export type RouteTimeMode = "game" | "real";
export type UiComponent = "speed" | "speedLimit";
export type ActiveComponents = UiComponent[];
export type LocaleCode = "en" | "de" | "nl" | "cs" | "sk" | "ko" | "ro" | "zh";

export interface GameProfile {
    themeColor: string;
    textColor: TextTheme;
    routeColor: string;
    backgroundColor: string;
    landColor: string;
    roadColor: string;
    units: UnitSystem;
    ownedDlcs: number[];
    lastDestination: [number, number] | null;
    hasTurnNavigation: boolean;
    fontFamily: string;
    activeMod: string | "none";
}

export interface AppSettingsState {
    selectedGame: GameType;
    savedIP: string | null;
    profiles: {
        ets2: GameProfile;
        ats: GameProfile;
    };
    hudBtnSize: number;
    truckMarkerSize: number;
    compactTripFontSize: number;
    activeUiComponents: ActiveComponents;
    locale: LocaleCode;
    routeTimeMode: RouteTimeMode;
}

const DEFAULT_PROFILE: GameProfile = {
    themeColor: "#0ea674",
    textColor: "dark",
    routeColor: "#0ea674",
    roadColor: "#515151",
    backgroundColor: "#1A1A1A",
    landColor: "#232323",
    units: "metric",
    ownedDlcs: Array.from({ length: 10 }, (_, i) => i + 1),
    lastDestination: null,
    hasTurnNavigation: true,
    fontFamily: "Jakarta",
    activeMod: "none",
};

const DEFAULT_SETTINGS: AppSettingsState = {
    selectedGame: null,
    savedIP: null,
    profiles: {
        ets2: {
            ...DEFAULT_PROFILE,
            units: "metric",
        },
        ats: {
            ...DEFAULT_PROFILE,
            ownedDlcs: Array.from({ length: 18 }, (_, i) => i + 1),
            units: "imperial",
        },
    },
    hudBtnSize: 28,
    truckMarkerSize: 40,
    compactTripFontSize: 1.8,
    activeUiComponents: ["speedLimit"],
    locale: "en",
    routeTimeMode: "game",
};

const STORAGE_KEY = "truck-nav-settings";

export const useSettings = () => {
    const settings = useState<AppSettingsState>("app-settings", () => ({
        ...DEFAULT_SETTINGS,
    }));

    const activeSettings = computed(() => {
        const game = settings.value.selectedGame || "ets2";
        return settings.value.profiles[game];
    });

    const applySideEffects = () => {
        document.documentElement.style.setProperty(
            "--theme-color",
            activeSettings.value.themeColor,
        );

        document.documentElement.style.setProperty(
            "--route-color",
            activeSettings.value.routeColor,
        );

        document.documentElement.style.setProperty(
            "--button-font-weight",
            activeSettings.value.textColor === "dark" ? "700" : "500",
        );

        const isLight = activeSettings.value.textColor === "light";

        document.documentElement.style.setProperty(
            "--main-text-color",
            isLight ? "#f2f2f2" : "#2d2d2d",
        );

        document.documentElement.style.setProperty(
            "--app-font",
            activeSettings.value.fontFamily,
        );

        document.documentElement.style.setProperty(
            "--hud-btn-size",
            `${settings.value.hudBtnSize}px`,
        );

        document.documentElement.style.setProperty(
            "--compact-trip-size",
            `${settings.value.compactTripFontSize}rem`,
        );
    };

    const saveSettings = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
        applySideEffects();
    };

    const updateGlobal = <K extends keyof Omit<AppSettingsState, "profiles">>(
        key: K,
        value: AppSettingsState[K],
    ) => {
        settings.value[key] = value;
        saveSettings();
    };

    const updateProfile = <K extends keyof GameProfile>(
        key: K,
        value: GameProfile[K],
    ) => {
        const game = settings.value.selectedGame || "ets2";
        settings.value.profiles[game][key] = value;
        saveSettings();
    };

    const initSettings = () => {
        const savedString = localStorage.getItem(STORAGE_KEY);

        if (savedString) {
            try {
                const parsed = JSON.parse(savedString);
                settings.value = { ...DEFAULT_SETTINGS, ...parsed };

                settings.value.profiles = {
                    ets2: {
                        ...DEFAULT_SETTINGS.profiles.ets2,
                        ...(parsed.profiles?.ets2 || {}),
                        fontFamily:
                            parsed.profiles?.ets2?.fontFamily ||
                            DEFAULT_SETTINGS.profiles.ets2.fontFamily,
                    },
                    ats: {
                        ...DEFAULT_SETTINGS.profiles.ats,
                        ...(parsed.profiles?.ats || {}),
                        fontFamily:
                            parsed.profiles?.ats?.fontFamily ||
                            DEFAULT_SETTINGS.profiles.ats.fontFamily,
                    },
                };
            } catch (e) {
                console.error("Corrupt settings found, resetting to defaults.");
                settings.value = { ...DEFAULT_SETTINGS };
            }
        } else {
            settings.value = { ...DEFAULT_SETTINGS };
        }

        applySideEffects();
    };

    const resetGlobalSetting = <
        K extends keyof Omit<AppSettingsState, "profiles">,
    >(
        key: K,
    ) => {
        settings.value[key] = DEFAULT_SETTINGS[key];
        saveSettings();
    };

    const resetProfileSetting = <K extends keyof GameProfile>(key: K) => {
        const game = settings.value.selectedGame || "ets2";
        const defaultValue = DEFAULT_SETTINGS.profiles[game][key];

        settings.value.profiles[game][key] = defaultValue;
        saveSettings();
    };

    const resetSettings = () => {
        const game = settings.value.selectedGame || "ets2";

        const currentDest = settings.value.profiles[game].lastDestination;

        const freshProfile = JSON.parse(
            JSON.stringify(DEFAULT_SETTINGS.profiles[game]),
        );
        freshProfile.lastDestination = currentDest;

        settings.value.hudBtnSize = DEFAULT_SETTINGS.hudBtnSize;
        settings.value.truckMarkerSize = DEFAULT_SETTINGS.truckMarkerSize;
        settings.value.compactTripFontSize =
            DEFAULT_SETTINGS.compactTripFontSize;
        settings.value.routeTimeMode = DEFAULT_SETTINGS.routeTimeMode;

        settings.value.activeUiComponents = [
            ...DEFAULT_SETTINGS.activeUiComponents,
        ];

        settings.value.profiles[game] = freshProfile;

        saveSettings();
    };

    return {
        settings,
        activeSettings,
        DEFAULT_SETTINGS,
        updateGlobal,
        updateProfile,
        resetGlobalSetting,
        resetProfileSetting,
        initSettings,
        resetSettings,
    };
};
