import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import Admin from "./Admin";
import "./admin.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#3f6df6",
          borderRadius: 10,
          colorText: "#111827",
          fontSize: 14,
          fontFamily: '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif',
        },
      }}
    >
      <Admin />
    </ConfigProvider>
  </React.StrictMode>,
);
