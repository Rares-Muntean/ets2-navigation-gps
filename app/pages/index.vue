<script lang="ts" setup>
import { SafeArea, SystemBarsType } from "@capacitor-community/safe-area";

const { isElectron, isMobile, isWeb } = usePlatform();

const currentView = ref<string>("");

watch(currentView, async () => {
    await nextTick();
    updateSystemBars();
});

const updateSystemBars = async () => {
    if (!isMobile.value) return;

    try {
        const isLandscape = window.innerWidth > window.innerHeight;

        if (isLandscape) {
            await SafeArea.hideSystemBars({ type: SystemBarsType.StatusBar });
            await SafeArea.hideSystemBars({
                type: SystemBarsType.NavigationBar,
            });
        } else {
            await SafeArea.showSystemBars({ type: SystemBarsType.StatusBar });
            await SafeArea.hideSystemBars({
                type: SystemBarsType.NavigationBar,
            });
        }
    } catch (e) {
        console.error("Bars update failed", e);
    }
};

onMounted(() => {
    setTimeout(() => {
        updateSystemBars();
    }, 500);
    window.addEventListener("resize", updateSystemBars);

    if (isWeb.value) {
        currentView.value = "map";
    } else if (isElectron.value) {
        currentView.value = "desktopHome";
    } else if (isMobile.value) {
        currentView.value = "mobileHome";
    }
});

onUnmounted(() => {
    window.removeEventListener("resize", updateSystemBars);
});

const launchMap = () => {
    currentView.value = "map";
};

const goHome = () => {
    if (isElectron.value) currentView.value = "desktopHome";
    if (isMobile.value) currentView.value = "mobileHome";
};
</script>

<template>
    <DesktopIndex
        v-if="currentView === 'desktopHome'"
        :launch-map="launchMap"
    />
    <MobileIndex
        v-if="currentView === 'mobileHome'"
        @connected="currentView = 'map'"
    />
    <LazyMap v-if="currentView === 'map'" :goHome="goHome" />
</template>
