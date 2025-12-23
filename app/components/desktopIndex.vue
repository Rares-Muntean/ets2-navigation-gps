<script lang="ts" setup>
import { AppSettings } from "~~/shared/variables/appSettings";

const { fetchIp, localIP } = useNetwork();
const isServerRunning = ref(false);
const polling = ref<any>(null);

defineProps<{ launchMap: () => void }>();

const checkStatus = async () => {
    const processExists = await (window as any).electronAPI.checkServerStatus();

    if (processExists) {
        try {
            const data = await (window as any).electronAPI.fetchTelemetry(
                "127.0.0.1"
            );
            isServerRunning.value = !!data;
        } catch {
            isServerRunning.value = false;
        }
    } else {
        isServerRunning.value = false;
    }
};

const startServer = () => {
    (window as any).electronAPI.manualStartServer();

    setTimeout(() => {
        checkStatus();
    }, 1000);
};

const startRegularPolling = () => {
    polling.value = setInterval(async () => {
        await checkStatus();
    }, 5000);
};

onMounted(async () => {
    await fetchIp();
    (window as any).electronAPI.setWindowSize(900, 600, false, false);

    checkStatus();

    const bootTimer = setInterval(async () => {
        if (isServerRunning.value) {
            clearInterval(bootTimer);
            startRegularPolling();
            return;
        }

        await checkStatus();
    }, 500);
});

onUnmounted(() => {
    if (polling.value) clearInterval(polling.value);
});

const openLink = async (url: string) => {
    (window as any).electronAPI.openExternal(url);
};
</script>

<template>
    <section
        :style="{ '--theme-color': AppSettings.theme.defaultColor }"
        class="section-device-info"
    >
        <div class="top-tagline">
            <Icon name="whh:gpsalt" class="icon" size="16" />
            <span>Your Trucking Companion</span>
        </div>

        <div class="content">
            <h2 class="title">Welcome to TruckerNav!</h2>
            <span class="subtitle"
                >Below you’ll find instructions to set up the GPS on your
                phone.</span
            >
            <div class="steps">
                <ol>
                    <li>Make sure ETS2 / ATS is running on your PC.</li>
                    <li>
                        Ensure your phone is connected to the same network as
                        your PC.
                    </li>
                    <li>Open the GPS app on your phone.</li>
                    <li>
                        Enter this IP to connect to the desktop telemetry:
                        <strong class="localIp">{{ localIP }}</strong>
                    </li>
                </ol>
            </div>

            <div class="bottom-info">
                <div class="status-div">
                    <div class="status">
                        <p>Current Status: &nbsp;</p>
                        <span
                            :class="
                                isServerRunning ? 'connected' : 'disconnected'
                            "
                            >{{
                                isServerRunning
                                    ? "Connected"
                                    : "Offline - try opening again."
                            }}</span
                        >
                    </div>

                    <div v-if="isServerRunning" class="safe-to-close">
                        <Icon
                            name="mdi:check-circle-outline"
                            size="20"
                            class="icon"
                        />
                        <span
                            >Safe to close this window! The server stays active
                            in your taskbar.</span
                        >
                    </div>
                </div>
            </div>
        </div>

        <div class="bottom">
            <div class="github-link">
                <Icon name="mdi:github" size="20" />
                <span>
                    GitHub Link:
                    <a
                        @click.prevent="
                            openLink(
                                'https://github.com/Rares-Muntean/ets2-navigation-gps'
                            )
                        "
                        >TruckNav</a
                    >
                </span>
            </div>

            <button @click.prevent="launchMap" class="btn">
                <span>Desktop GPS</span>
                <Icon name="material-symbols:map-rounded" size="20" />
            </button>
        </div>
    </section>
</template>

<style scoped lang="scss" src="~/assets/scss/scoped/desktopIndex.scss"></style>
