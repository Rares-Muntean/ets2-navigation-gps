<script lang="ts" setup>
import type { Color } from "maplibre-gl";

const props = defineProps<{
    text: string;
    trigger: number;
    iconName: string;
    iconColor: string;
}>();

const isVisible = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
    () => props.trigger,
    (newVal) => {
        if (newVal > 0) {
            isVisible.value = true;

            if (timer) clearTimeout(timer);

            timer = setTimeout(() => {
                isVisible.value = false;
            }, 2000);
        }
    }
);
</script>

<template>
    <div class="notification-container">
        <Transition name="notification-slide">
            <div v-if="isVisible" class="notification-wrapper">
                <Transition name="notification-fade">
                    <div class="content-wrapper">
                        <span>{{ text }}</span>
                        <Icon
                            class="notification-icon"
                            :name="iconName"
                            size="24"
                            :style="{ color: iconColor }"
                        />
                    </div>
                </Transition>
            </div>
        </Transition>
    </div>
</template>

<style
    scoped
    lang="scss"
    src="~/assets/scss/scoped/notificationRoute.scss"
></style>
