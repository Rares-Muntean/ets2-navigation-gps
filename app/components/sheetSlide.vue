<script lang="ts" setup>
import { AppSettings } from "~~/shared/variables/appSettings";

const props = defineProps<{
    isSheetExpanded: boolean;
    isSheetHidden: boolean;
    truckSpeed: number;
    speedLimit: number;
    destinationName: string;
    routeEta: string;
    routeDistance: string;
    clearRouteState: () => void;
    onStartNavigation: () => void;
}>();

const emit = defineEmits<{
    (e: "update:isSheetHidden", value: boolean): void;
    (e: "update:isSheetExpanded", value: boolean): void;
}>();

const onToggleSheetHidden = () => {
    emit("update:isSheetHidden", !props.isSheetHidden);
};

function onToggleSheet() {
    emit("update:isSheetExpanded", !props.isSheetExpanded);
}
</script>

<template>
    <div
        class="bottom-sheet"
        :class="{ 'is-expanded': isSheetExpanded, 'is-hidden': isSheetHidden }"
        :style="{
            '--theme-color': AppSettings.theme.defaultColor,
        }"
    >
        <SpeedLimit
            :truck-speed="truckSpeed"
            :speed-limit="speedLimit"
            variant="sheet"
        />

        <div class="sheet-header" @click="onToggleSheet">
            <div class="drag-pill"></div>
        </div>

        <div class="sheet-body">
            <div class="hide-sheet">
                <button
                    v-if="!isSheetExpanded"
                    @click.prevent="onToggleSheetHidden"
                    class="hide-sheet-btn nav-btn"
                >
                    <Icon
                        :name="
                            isSheetHidden
                                ? 'bxs:chevron-up'
                                : 'bxs:chevron-down'
                        "
                        class="chevron-icon"
                        size="18"
                    />
                    {{ isSheetHidden ? "Show" : "Hide" }}
                </button>
            </div>

            <div class="top-row">
                <div class="trip-info" @click="onToggleSheet">
                    <h2 class="dest-name">{{ destinationName }}</h2>

                    <div class="mini-stats">
                        <span class="eta">{{ routeEta }}</span>
                        <span class="dist">({{ routeDistance }})</span>
                    </div>
                </div>

                <button
                    class="cancel-btn nav-btn"
                    @click.stop="clearRouteState"
                >
                    <Icon name="material-symbols:close-rounded" size="24" />
                </button>
            </div>

            <div class="expanded-content">
                <div class="separator"></div>

                <div class="full-stats">
                    <div class="stat-block">
                        <Icon
                            name="tabler:clock-filled"
                            size="26"
                            class="icon-eta"
                        />
                        <div>
                            <div class="value">{{ routeEta }}</div>
                            <div class="label">Estimated Time</div>
                        </div>
                    </div>

                    <div class="stat-block">
                        <Icon
                            name="tabler:ruler-2"
                            size="26"
                            class="icon-dist"
                        />
                        <div>
                            <div class="value">{{ routeDistance }}</div>
                            <div class="label">Distance</div>
                        </div>
                    </div>
                </div>

                <div class="action-buttons" @click.prevent="onStartNavigation">
                    <button class="start-btn nav-btn">
                        <Icon name="tabler:navigation-check" size="24" />
                        <span>Start Navigation</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
@use "~/assets/scss/scoped/sheetSlide.scss";
</style>
