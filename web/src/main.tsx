import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { AppearanceProvider } from "./theme/AppearanceContext";
import { GlobalStyle } from "./theme/GlobalStyle";
import { theme } from "./theme/theme";
import { cache } from "./cache";
import { getDefaultTerminalLayout, initTerminalCache } from "./components/Terminal/terminalPersist";
import { APP_NAME } from "./brand";
import { applyConnectionFavicon } from "./connectionFavicon";

document.title = APP_NAME;
applyConnectionFavicon("idle");

initTerminalCache();
if (!cache.terminal.tabs.length) {
  Object.assign(cache.terminal, getDefaultTerminalLayout());
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <AppearanceProvider>
        <GlobalStyle />
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </AppearanceProvider>
    </ThemeProvider>
  </React.StrictMode>
);
