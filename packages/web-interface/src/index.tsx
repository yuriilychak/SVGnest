import { createRoot } from 'react-dom/client';

import App from './app';

import './i18n';

// Render your React component instead
const root = createRoot(document.getElementById('app'));

root.render(<App />);
