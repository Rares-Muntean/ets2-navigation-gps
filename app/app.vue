<script setup lang="ts">
useHead({
    title: "EuroTruck Nav",
    link: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: "anonymous",
        },
        {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap",
        },
    ],
});
</script>

<template>
    <NuxtPage />
</template>

<style lang="scss">
@use "~/assets/scss/global/global";
</style>
