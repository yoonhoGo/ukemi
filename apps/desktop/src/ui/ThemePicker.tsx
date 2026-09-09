import { useState } from "react";
import { applyTheme, currentTheme, THEMES } from "../themes/themes.ts";
import { t } from "../i18n/i18n.ts";

/**
 * Theme switch.
 *
 * Exists so the contract in `themes/contract.css` is actually exercised rather
 * than merely documented: a theme nobody can select is a theme nobody has
 * checked (design §8 principle ③).
 *
 * Lives in the Settings sheet rather than the sidebar it was first written
 * for, so it carries no positioning of its own any more — `.side-head`'s own
 * padding is the section spacing, and the rows are the contract's `.side-item`
 * unchanged. The note stays a tooltip: `.side-item` is a fixed 28px row, and a
 * second line of prose inside one would be a fight with the contract rather
 * than a use of it.
 */
export function ThemePicker() {
  const [active, setActive] = useState(currentTheme);

  return (
    <section>
      <div className="side-head">{t("Theme")}</div>
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
    </section>
  );
}
