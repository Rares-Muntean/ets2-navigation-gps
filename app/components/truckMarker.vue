<script lang="ts" setup>
import { darkenColor, lightenColor } from "~/assets/utils/colors";
import { AppSettings } from "~~/shared/variables/appSettings";

const markerElement = ref<HTMLElement | null>(null);
defineExpose({ markerElement });
defineProps<{ isCameraLocked: boolean }>();
</script>

<template>
    <div style="display: none">
        <!-- TODO (after Capacitor build): If the camera is locked, add the class .is-smooth -->
        <div ref="markerElement" class="truck-marker">
            <svg
                width="48"
                height="48"
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style="
                    display: block;
                    filter: drop-shadow(0px 6px 8px rgba(0, 0, 0, 0.3));
                "
            >
                <defs>
                    <linearGradient
                        id="two-tone"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%"
                    >
                        <stop
                            offset="50%"
                            :stop-color="
                                darkenColor(AppSettings.theme.defaultColor, 0.1)
                            "
                        />
                        <stop
                            offset="50%"
                            :stop-color="
                                lightenColor(
                                    AppSettings.theme.defaultColor,
                                    0.23
                                )
                            "
                        />
                    </linearGradient>
                </defs>

                <path
                    d="M50 10 L90 85 L50 70 L10 85 Z"
                    fill="url(#two-tone)"
                    stroke="url(#two-tone)"
                    stroke-width="12"
                    stroke-linejoin="round"
                    paint-order="stroke fill"
                />
            </svg>
        </div>
    </div>
</template>

<style lang="scss" scoped src="~/assets/scss/scoped/truckMarker.scss"></style>
