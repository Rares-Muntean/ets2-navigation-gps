<script lang="ts" setup>
const props = defineProps<{
    isCalculatingRoute: boolean;
    isRouteFound: boolean | null;
}>();

const iconName = computed(() => {
    if (props.isRouteFound === true) {
        return "ic:outline-check";
    } else if (props.isRouteFound === false) {
        return "ic:outline-close";
    }

    return "svg-spinners:ring-resize";
});

const notificationName = computed(() => {
    if (props.isRouteFound === true) {
        return "Route Found";
    } else if (props.isRouteFound === false) {
        return "No Route Available";
    }

    return "Locating Route";
});

const iconClass = computed(() => {
    if (props.isRouteFound === true) {
        return "found";
    } else if (props.isRouteFound === false) {
        return "failed";
    }

    return "loading";
});

const isVisible = computed(() => {
    return props.isCalculatingRoute || props.isRouteFound !== null;
});
</script>

<template>
    <div class="notification-container">
        <Transition name="notification-slide">
            <div v-if="isVisible" class="notification-wrapper">
                <Transition name="notification-fade">
                    <div class="content-wrapper">
                        <span>{{ notificationName }}</span>
                        <Icon
                            class="notification-icon"
                            :name="iconName"
                            :class="iconClass"
                            size="24"
                        />
                    </div>
                </Transition>
            </div>
        </Transition>
    </div>
</template>

<style
    lang="scss"
    scoped
    src="~/assets/scss/scoped/notificationRoute.scss"
></style>
