import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { AppRoutes } from "./app/router";
import "./index.css";

async function enableMocking() {
  // Chỉ dev: VITE_USE_MOCK=1 cho phép làm web khi chưa chạy API (MSW chặn fetch theo hợp đồng API).
  if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCK !== "1") return;
  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass" });
}

void enableMocking().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </StrictMode>,
  );
});
