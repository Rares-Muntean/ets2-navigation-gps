<script lang="ts" setup>
const { isElectron, isMobile, isWeb } = usePlatform();

const currentView = ref<string>("");

onMounted(() => {
    if (isWeb.value) {
        currentView.value = "map";
    } else if (isElectron.value) {
        currentView.value = "desktopHome";
    } else if (isMobile.value) {
        currentView.value = "mobileHome";
    }
});

const launchMap = () => {
    currentView.value = "map";
};

const goHome = () => {
    currentView.value = "desktopHome";
};
</script>

<template>
    <DesktopIndex
        v-if="currentView === 'desktopHome'"
        :launch-map="launchMap"
    />
    <MobileIndex
        v-if="currentView === 'mobileHome'"
        @connected="currentView = 'mobileHome'"
    />
    <LazyMap v-if="currentView === 'map'" :goHome="goHome" />
</template>
