// The SPA is served at /izensphere-stay-and-dine in production (with /kamra and /stay-and-dine supported) and at / by the Vite dev server.
export const ROUTER_BASENAME = (() => {
  if (!import.meta.env.PROD) return "/"
  const p = typeof window !== "undefined" ? window.location.pathname : ""
  if (p.startsWith("/kamra")) return "/kamra"
  if (p.startsWith("/stay-and-dine")) return "/stay-and-dine"
  return "/izensphere-stay-and-dine"
})()

// Prefix an in-app path with the basename for a full-page navigation
// (window.location), which the router's own navigate() would otherwise add.
export function toFullPath(path: string): string {
  const base = ROUTER_BASENAME === "/" ? "" : ROUTER_BASENAME
  return base + (path.startsWith("/") ? path : "/" + path)
}
