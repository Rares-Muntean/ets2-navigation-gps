<script lang="ts" setup>
import { AppSettings } from "~~/shared/variables/appSettings";

const { saveIP, loadIP } = useSettings();

const ipInput = ref("");
const isConnecting = ref(false);

const emit = defineEmits(["connected"]);

onMounted(async () => {
    const existing = await loadIP();
    if (existing) ipInput.value = existing;
});

const handleConnect = async () => {
    if (!ipInput.value) return "Please input a value.";

    isConnecting.value = true;

    await saveIP(ipInput.value);

    setTimeout(() => {
        isConnecting.value = false;
        emit("connected");
    }, 500);
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
                    Current Status: &nbsp;
                    <span class="connected">Connected</span>
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
