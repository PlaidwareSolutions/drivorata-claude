import { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  theme: ResolvedTheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  setMode: () => {},
  theme: "light",
  toggleTheme: () => {},
});

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return getSystemTheme();
  return mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme-mode") as ThemeMode | null;
      if (saved === "system" || saved === "light" || saved === "dark") return saved;
      const legacy = localStorage.getItem("theme") as string | null;
      if (legacy === "dark") return "dark";
      if (legacy === "light") return "light";
    }
    return "system";
  });

  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(mode));

  useEffect(() => {
    const resolved = resolveTheme(mode);
    setTheme(resolved);
    const root = document.documentElement;
    if (resolved === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme-mode", mode);
    localStorage.removeItem("theme");
  }, [mode]);

  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "dark" : "light";
      setTheme(resolved);
      const root = document.documentElement;
      if (resolved === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
  };

  const toggleTheme = () => {
    setModeState((prev) => {
      if (prev === "light") return "dark";
      if (prev === "dark") return "light";
      return resolveTheme("system") === "dark" ? "light" : "dark";
    });
  };

  return (
    <ThemeContext.Provider value={{ mode, setMode, theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export type { ThemeMode, ResolvedTheme };
