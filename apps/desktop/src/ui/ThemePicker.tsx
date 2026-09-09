import { useState } from "react";
import { applyTheme, currentTheme, THEMES } from "../themes/themes.ts";
import { t } from "../i18n/i18n.ts";

/**
 * Theme switch.
 *
 * Exists so the contract in `themes/contract.css` is actually exercised rather
 * than merely documented: a theme nobody can select is a theme nobody has
 * checked (design §8 principle ③).
 */
export function ThemePicker() {
  const [active, setActive] = useState(currentTheme);

  return (
    <div style={{ marginTop: "auto", paddingTop: 14 }}>
      <div className="side-head" style={{ padding: "0 8px 4px" }}>
        {t("Theme")}
      </div>
      {THEMES.map((theme) => (
        <button
          type="button"
          className="side-item"
          key={theme.id}
          aria-current={theme.id === active}
          title={t(theme.note)}
          onClick={() => {
            applyTheme(theme.id);
            setActive(theme.id);
          }}
        >
          <span style={{ flexGrow: 1 }}>{t(theme.name)}</span>
        </button>
      ))}
    </div>
  );
}
