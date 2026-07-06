import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/Button";
import { applyThemeMode, getInitialThemeMode, persistThemeMode, type ThemeMode } from "#/lib/theme";

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getInitialThemeMode);

  useEffect(() => {
    if (mode !== "auto") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeMode("auto");

    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [mode]);

  function toggleMode() {
    const nextMode: ThemeMode = mode === "light" ? "dark" : mode === "dark" ? "auto" : "light";
    setMode(nextMode);
    applyThemeMode(nextMode);
    persistThemeMode(nextMode);
  }

  const label =
    mode === "auto"
      ? "Theme mode: auto (system). Click to switch to light mode."
      : `Theme mode: ${mode}. Click to switch mode.`;

  return (
    <Button variant="outline" size="icon-sm" onClick={toggleMode} aria-label={label} title={label}>
      {mode === "dark" ? (
        <Moon size={16} />
      ) : mode === "light" ? (
        <Sun size={16} />
      ) : (
        <Monitor size={16} />
      )}
    </Button>
  );
}
