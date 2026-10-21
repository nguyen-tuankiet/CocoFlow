import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import Admin from "./Admin";
import "./admin.css";

// A render error would otherwise leave a blank page; show what went wrong instead.
class Boundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <pre style={{ padding: 24, whiteSpace: "pre-wrap", color: "#b91c1c" }}>
        Trang admin gặp lỗi:{"\n"}
        {String(this.state.error.stack ?? this.state.error.message).slice(0, 1200)}
      </pre>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boundary>
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
    </Boundary>
  </React.StrictMode>,
);
