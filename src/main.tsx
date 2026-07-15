import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { initializeCapacitor, isNative } from "./lib/capacitor"
import "./bones/registry"
import "./index.css"

async function bootstrap() {
  if (isNative) {
    await initializeCapacitor();
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
