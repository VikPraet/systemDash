import { Moon, Sun } from "lucide-react";
import { useAppearance } from "../../theme/AppearanceContext";
import { Tooltip } from "./Tooltip";
import { IconBtn } from "./styles";

export function ThemeToggle() {
  const { appearance, toggleAppearance } = useAppearance();
  const next = appearance === "dark" ? "light" : "dark";
  const label = next === "light" ? "Light theme" : "Dark theme";

  return (
    <Tooltip label={label}>
      <IconBtn
        type="button"
        aria-label={label}
        aria-pressed={appearance === "dark"}
        onClick={toggleAppearance}
      >
        {appearance === "dark" ? (
          <Sun size={16} strokeWidth={1.8} />
        ) : (
          <Moon size={16} strokeWidth={1.8} />
        )}
      </IconBtn>
    </Tooltip>
  );
}
