import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "./index.css"
import App from "./App"
import { initTheme } from "./lib/theme"
import { initLang } from "./lib/dir"
import { asset } from "./lib/asset"
import { AuthProvider } from "./lib/auth"
import { CashierAuthProvider } from "./lib/cashierAuth"
import { ROUTER_BASENAME } from "./lib/routing"

initTheme()
initLang()

// Favicons, base-aware (see index.html note).
function setIcon(rel: string, href: string, type?: string) {
  const link = document.createElement("link")
  link.rel = rel
  link.href = asset(href)
  if (type) link.type = type
  document.head.appendChild(link)
}
setIcon("icon", "izensphere-stay-and-dine-mark.svg", "image/svg+xml")
setIcon("shortcut icon", "izensphere-stay-and-dine-mark.svg", "image/svg+xml")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={ROUTER_BASENAME}>
      <AuthProvider>
        <CashierAuthProvider>
          <App />
        </CashierAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
