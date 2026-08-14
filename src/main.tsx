import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './app/styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('The application root is missing.');
}

registerSW({ immediate: false });

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
