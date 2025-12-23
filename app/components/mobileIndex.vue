<script lang="ts" setup>
import { CapacitorHttp } from "@capacitor/core";
import { AppSettings } from "~~/shared/variables/appSettings";

const { saveIP, loadIP } = useSettings();

const ipInput = ref("");
const isConnecting = ref(false);
const connectionError = ref("Disconnected");
const isConnected = ref(false);

const emit = defineEmits(["connected"]);

watch(isConnected, (connected) => {
    if (connected) {
        emit("connected");
    }
});

onMounted(async () => {
    const existing = await loadIP();
    if (existing) ipInput.value = existing;
});

const handleConnect = async () => {
    connectionError.value = "Disconnected";

    if (!ipInput.value) {
        connectionError.value = "Please input a value.";
        return;
    }

    isConnecting.value = true;

    const url = `http://${ipInput.value}:25555/api/ets2/telemetry`;

    try {
        const options = {
            url: url,
            connectTimeout: 2000,
            readTimeout: 2000,
        };

        const response = await CapacitorHttp.get(options);

        if (response.status === 200 && response.data) {
            await saveIP(ipInput.value);

            isConnected.value = true;

            setTimeout(() => {
                isConnecting.value = false;
                emit("connected");
            }, 500);
        } else {
            throw new Error("Server reached but returned invalid data");
        }
    } catch (error) {
        isConnected.value = false;
        console.error("Connection failed:", error);
        connectionError.value =
            "Could not connect to TruckNav. Is the server running and on the same Wi-Fi?";
        isConnecting.value = false;
    }
};
</script>

<template>
    <section
        :style="{ '--theme-color': AppSettings.theme.defaultColor }"
        class="section-mobile-menu"
    >
        <div class="title">
            <Icon
                class="icon"
                name="i-material-symbols:connected-tv-outline"
                size="20"
            />
            <span>Pair with Computer</span>
        </div>

        <div class="content">
            <div class="form-details">
                <form @submit.prevent="handleConnect" action="">
                    <label for="ip">IP Address:</label>
                    <input
                        id="ip"
                        v-model="ipInput"
                        type="text"
                        name="ip"
                        placeholder="Type here..."
                        :disabled="isConnecting"
                    />
                </form>
                <p class="status">
                    <span v-if="!connectionError">Current Status: &nbsp;</span>
                    <span :class="isConnected ? 'connected' : 'disconnected'">{{
                        isConnected ? "Connected" : connectionError
                    }}</span>
                </p>
            </div>

            <div class="description">
                <div class="note">
                    <Icon name="i-majesticons:information-circle-line" />
                    <p>Note</p>
                </div>
                <p class="description-text">
                    Enter the IP shown in TruckNav from your computer
                </p>
            </div>
        </div>

        <button class="btn" @click="handleConnect" :disabled="isConnecting">
            <span>{{ isConnecting ? "Connecting..." : "Connect" }}</span>
            <Icon name="i-fa7-solid:chain" size="20" />
        </button>
    </section>
</template>

<style scoped lang="scss" src="~/assets/scss/scoped/mobileIndex.scss"></style>
