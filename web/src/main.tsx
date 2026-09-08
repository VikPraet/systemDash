import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "styled-components";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { AppearanceProvider } from "./theme/AppearanceContext";
import { DashboardProvider } from "./theme/DashboardContext";
import { GlobalStyle } from "./theme/GlobalStyle";
import { theme } from "./theme/theme";
import {
  applyTheme,
  readStoredAppearance,
  readStoredThemeId,
  resolveTheme,
} from "./theme/appearance";
import { cache } from "./cache";
import { getDefaultTerminalLayout, initTerminalCache } from "./components/Terminal/terminalPersist";
import { APP_NAME } from "./brand";
import { applyConnectionFavicon } from "./connectionFavicon";

document.title = APP_NAME;
applyConnectionFavicon("idle");
applyTheme(resolveTheme(readStoredThemeId()), readStoredAppearance());

initTerminalCache();
if (!cache.terminal.tabs.length) {
  Object.assign(cache.terminal, getDefaultTerminalLayout());
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <BrowserRouter>
        <AuthProvider>
          <AppearanceProvider>
            <DashboardProvider>
              <App />
            </DashboardProvider>
          </AppearanceProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
