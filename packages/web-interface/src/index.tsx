import { createRoot } from 'react-dom/client';

import App from './app';
import fetchLocales from './i18n';

async function init() {
    await fetchLocales();

    // Render your React component instead
    const root = createRoot(document.getElementById('app'));

    root.render(<App />);
}

init();
