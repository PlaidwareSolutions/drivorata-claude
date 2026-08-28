import { createContext, useContext, useEffect, useRef } from "react";

type UIContext = "platform" | "school" | "public";

interface UIContextType {
  uiContext: UIContext;
}

const UIContextContext = createContext<UIContextType>({
  uiContext: "school",
});

interface UIContextProviderProps {
  context: UIContext;
  tenantPrimary?: string;
  tenantAccent?: string;
  children: React.ReactNode;
}

export function UIContextProvider({ context, tenantPrimary, tenantAccent, children }: UIContextProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.setAttribute("data-ui-context", context);
    if (context === "public" && tenantPrimary) {
      el.setAttribute("data-tenant-primary", "true");
      el.style.setProperty("--tenant-primary", tenantPrimary);
    } else {
      el.removeAttribute("data-tenant-primary");
      el.style.removeProperty("--tenant-primary");
    }
    if (context === "public" && tenantAccent) {
      el.setAttribute("data-tenant-accent", "true");
      el.style.setProperty("--tenant-accent", tenantAccent);
    } else {
      el.removeAttribute("data-tenant-accent");
      el.style.removeProperty("--tenant-accent");
    }
  }, [context, tenantPrimary, tenantAccent]);

  return (
    <UIContextContext.Provider value={{ uiContext: context }}>
      <div ref={containerRef} data-ui-context={context} className="contents">
        {children}
      </div>
    </UIContextContext.Provider>
  );
}

export function useUIContext() {
  return useContext(UIContextContext);
}

export type { UIContext };
