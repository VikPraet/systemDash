import { Palette } from "lucide-react";
import { useAppearance } from "../../theme/AppearanceContext";
import { Tooltip } from "./Tooltip";
import { IconBtn } from "./styles";

export function PaletteToggle() {
  const { palette, togglePalette } = useAppearance();
  const next = palette === "classic" ? "lime" : "classic";
  const label = next === "lime" ? "Lime theme" : "Classic theme";

  return (
    <Tooltip label={label}>
      <IconBtn
        type="button"
        aria-label={label}
        aria-pressed={palette === "lime"}
        onClick={togglePalette}
      >
        <Palette size={16} strokeWidth={1.8} />
      </IconBtn>
    </Tooltip>
  );
}
