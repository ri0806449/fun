import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        laravel({
            input: [
                'resources/css/app.css',
                'resources/js/app.js',
                'resources/css/game.css',
                'resources/js/game/main.js',
            ],
            refresh: true,
            fonts: [
                bunny('Instrument Sans', { weights: [400, 500, 600] }),
                bunny('Orbitron', { weights: [500, 700] }),
                bunny('Rajdhani', { weights: [500, 600, 700] }),
            ],
        }),
        tailwindcss(),
    ],
    build: {
        rollupOptions: {
            output: {
                // Vite 8（rolldown）只接受函式型 manualChunks
                manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
            },
        },
    },
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
