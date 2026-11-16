import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "mkd-theme";

/** Tema claro/escuro. Lê a preferência só no navegador (a página também é renderizada no servidor). */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* armazenamento indisponível */
    }
    if (saved === "light" || saved === "dark") setTheme(saved);
    else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* armazenamento indisponível */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
