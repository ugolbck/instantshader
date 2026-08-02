import { createRoot } from "react-dom/client";
import App from "./App";

// No StrictMode: this dev server IS the automation target (the screenshot
// sweep hits it directly, unlike the app repo where sweeps hit a production
// `next start`). StrictMode's dev-only double-invoke of effects would fire
// each tile's mount effect twice, racing markReady() and risking
// `data-gk-ready` flipping before every tile has actually painted once.
createRoot(document.getElementById("root")!).render(<App />);
