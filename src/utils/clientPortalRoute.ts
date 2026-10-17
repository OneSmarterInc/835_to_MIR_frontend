import { useCallback, useEffect, useState } from "react";

const pagePaths = {
  home: "/", convert: "/conversions", analysis: "/analysis",
  "835837": "/835-837-status", history: "/history", settings: "/settings",
} as const;
type Page = keyof typeof pagePaths;
type Route = { tab: Page | "claim"; claimId: string | null; analysisClaim: string | null; historySection: "files" | "activity" };

export function readClientRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  const route: Route = { tab: "home", claimId: null, analysisClaim: null, historySection: "files" };
  for (const [tab, value] of Object.entries(pagePaths)) {
    if (path === value) return { ...route, tab: tab as Page };
  }
  if (path === "/history/activity") return { ...route, tab: "history", historySection: "activity" };
  const match = path.match(/^\/(analysis\/)?claims\/([^/]+)$/);
  if (match) {
    try {
      const id = decodeURIComponent(match[2]);
      return match[1] ? { ...route, tab: "analysis", analysisClaim: id }
        : { ...route, tab: "claim", claimId: id };
    } catch { /* Malformed URL: use the home view. */ }
  }
  return route;
}

export function clientPagePath(page: Page | "claim", id?: string | null): string {
  if (page === "claim") return id ? `/claims/${encodeURIComponent(id)}` : "/";
  if (page === "analysis" && id) return `/analysis/claims/${encodeURIComponent(id)}`;
  return pagePaths[page];
}

export function useClientPortalRoute() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const navigate = useCallback((path: string) => {
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
    setPathname(path);
  }, []);
  return { ...readClientRoute(pathname), pathname, navigate };
}
