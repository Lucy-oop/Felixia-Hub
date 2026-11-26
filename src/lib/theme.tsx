"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** Light / Dark / Auto (follows the device). Saved per device in localStorage. */
export type ThemePref = "light" | "dark" | "system";
type Resolved = "light" | "dark";

export const THEME_KEY = "felixia-theme";

/** Runs in <head> before the page paints, so a reload never flashes the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||((p!=="light")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})();`;

const media = () => window.matchMedia("(prefers-color-scheme: dark)");
const readPref = (): ThemePref => {
  try {
    const p = localStorage.getItem(THEME_KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
};
const resolve = (p: ThemePref): Resolved => (p === "system" ? (media().matches ? "dark" : "light") : p);
function apply(r: Resolved) {
  const e = document.documentElement;
  e.classList.toggle("dark", r === "dark");
  e.style.colorScheme = r;
}

const Ctx = createContext<{ pref: ThemePref; resolved: Resolved; setPref: (p: ThemePref) => void; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // the <head> script already set the class; read it back after mount
  const [pref, setPrefState] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<Resolved>("light");

  useEffect(() => {
    const p = readPref();
    setPrefState(p);
    setResolved(resolve(p));
  }, []);

  // Auto: follow the device live
  useEffect(() => {
    if (pref !== "system") return;
    const m = media();
    const on = () => {
      const r: Resolved = m.matches ? "dark" : "light";
      apply(r);
      setResolved(r);
    };
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    try {
      if (p === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, p);
    } catch {}
    const r = resolve(p);
    apply(r);
    setPrefState(p);
    setResolved(r);
  }, []);

  const toggle = useCallback(() => setPref(resolved === "dark" ? "light" : "dark"), [resolved, setPref]);

  return <Ctx.Provider value={{ pref, resolved, setPref, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
