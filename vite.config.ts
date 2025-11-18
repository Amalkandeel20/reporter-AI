import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    server: {
        port: 3000,
        host: '0.0.0.0',
    },
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
            devOptions: {
                enabled: true,
                suppressWarnings: true,
            },
            manifest: {
                name: 'Reporter AI',
                short_name: 'ReporterAI',
                description: 'Smart worksite report generator',
                theme_color: '#0f172a',
                background_color: '#ffffff',
                display: 'standalone',
                start_url: '/',
                icons: [
                    {
                        src: '/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
});
