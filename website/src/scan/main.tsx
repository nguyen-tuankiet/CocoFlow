import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import { LangProvider } from "../lang";
import ScanApp from "./ScanApp";
import "./scan.css";

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
      <LangProvider title={{ vi: "Làm thẳng ảnh tài liệu – Cocoflow", en: "Straighten document photos – Cocoflow" }}>
        <ScanApp />
      </LangProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
