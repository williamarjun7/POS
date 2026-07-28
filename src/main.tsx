// ─── Startup diagnostics: track each initialization stage ──
console.log('[STARTUP] 0/5: main.tsx executing...');

import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { initializeCapacitor, isNative } from "./lib/capacitor"
import "./bones/registry"
import "./index.css"

console.log('[STARTUP] 1/5: All imports resolved');

async function bootstrap() {
  console.log('[STARTUP] 2/5: bootstrap() called');

  if (isNative) {
    console.log('[STARTUP]   ↳ Capacitor platform detected, initializing...');
    await initializeCapacitor();
    console.log('[STARTUP]   ↳ Capacitor initialized');
  }

  const root = document.getElementById("root");
  console.log('[STARTUP] 3/5: root element:', root ? 'found ✓' : 'MISSING ✗');

  if (root) {
    console.log('[STARTUP] 4/5: Creating React root...');
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('[STARTUP] ✓ React initialized (5/5)');
  } else {
    console.error('[STARTUP] ✗ CRITICAL: #root element not found!');
  }
}

bootstrap().catch(err => {
  console.error('[STARTUP] ✗ bootstrap() threw:', err);
});
