// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: "2025-07-15",
    devtools: { enabled: false },
    ssr: false,
    modules: ["@nuxt/icon"],
    vite: {
        css: {
            preprocessorOptions: {
                scss: {
                    additionalData: `@use "~/assets/scss/global/variables.scss" as *;`,
                },
            },
        },
    },

    app: {
        head: {
            title: "TruckNav",
            meta: [
                {
                    name: "viewport",
                    content:
                        "width=device-width, initial-scale=1, viewport-fit=cover",
                },
            ],
        },
    },
});
