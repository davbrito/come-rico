import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

export type ThemeMode = "light" | "dark" | "auto";

export const THEME_COOKIE_NAME = "theme";

function isThemeMode(value: string | undefined | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "auto";
}

/**
 * Reads the theme cookie on both server and client, so SSR and the first
 * client render agree on `mode` without waiting for a post-mount effect.
 */
export const getInitialThemeMode = createIsomorphicFn()
  .server(() => {
    const cookie = getCookie(THEME_COOKIE_NAME);
    return isThemeMode(cookie) ? cookie : "auto";
  })
  .client((): ThemeMode => {
    const match = document.cookie.match(/(?:^|; )theme=([^;]*)/);
    const value = match ? decodeURIComponent(match[1]) : undefined;
    return isThemeMode(value) ? value : "auto";
  });

export function persistThemeMode(mode: ThemeMode) {
  document.cookie = `${THEME_COOKIE_NAME}=${mode}; path=/; max-age=31536000; samesite=lax`;
}

export function applyThemeMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;

  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);

  if (mode === "auto") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", mode);
  }

  document.documentElement.style.colorScheme = resolved;
}
