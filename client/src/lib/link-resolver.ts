const PLATFORM_HOSTNAMES = new Set(
  [
    "drivorata.com",
    "www.drivorata.com",
    "drivorata.replit.app",
    import.meta.env.VITE_PLATFORM_DOMAIN,
  ].filter(Boolean)
);

export function createLinkResolver(
  isOnCustomDomain: boolean
): (href: string | undefined | null) => string {
  if (!isOnCustomDomain) {
    return (href) => href || "";
  }
  return (href) => {
    if (!href) return href || "";
    try {
      const url = new URL(href);
      if (PLATFORM_HOSTNAMES.has(url.hostname)) {
        return url.pathname + url.search + url.hash;
      }
    } catch {
    }
    return href;
  };
}
