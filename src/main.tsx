import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayWarning } from "./components/OverlayWarning";
import "./index.css";

const isOverlayWindow = window.location.search.includes("window=overlay");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOverlayWindow ? <OverlayWarning /> : <App />}
  </React.StrictMode>,
);
