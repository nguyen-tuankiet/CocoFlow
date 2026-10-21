import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import App from "./App";
import { LangProvider } from "./lang";
import { trackView } from "./track";
import "./styles.css";

trackView();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#3f6df6",
          borderRadius: 10,
          colorBgLayout: "#ffffff",
          colorBgContainer: "#ffffff",
          colorTextSecondary: "#4b5563",
          colorTextDescription: "#6b7280",
          colorText: "#111827",
          fontSize: 16,
          fontFamily: '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif',
        },
      }}
    >
      <LangProvider>
        <App />
      </LangProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
