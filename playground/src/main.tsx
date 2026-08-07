import { createRoot } from "react-dom/client";
import Studio from "./Studio";

// No StrictMode: its dev-only double-invoke of effects would mount and
// dispose the WebGL context twice on every render pass, which is noisy to
// debug and pointless for a single-canvas playground.
//
// Search params are read once here rather than subscribed to — there is no
// router, and every control is React state.
createRoot(document.getElementById("root")!).render(
  <Studio searchParams={new URLSearchParams(window.location.search)} />,
);
