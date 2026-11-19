import '../css/app.css';
import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

const appName = import.meta.env.VITE_APP_NAME || 'Web Access Log Analytics';

const pages = import.meta.glob('./pages/**/*.tsx');

void createInertiaApp({
    title: (title) => (title ? `${title} — ${appName}` : appName),
    resolve: async (name) => {
        const path = `./pages/${name}.tsx`;
        const page = pages[path];
        if (!page) {
            throw new Error(`Page not found: ${path}`);
        }
        return (await page()) as any;
    },
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />);
    },
    progress: {
        color: '#38bdf8',
    },
});
