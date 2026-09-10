import { useState } from "react";
import { t } from "../i18n/i18n.ts";
import {
  applyFonts,
  MONO_FONT_SUGGESTIONS,
  rememberedFonts,
  UI_FONT_SUGGESTIONS,
  type Fonts,
} from "../themes/fonts.ts";

/**
 * Font choice — one row for the interface face, one for code.
 *
 * WebKit has no way to list the fonts on the machine, so each row is a text
 * field with a `<datalist>` of likely names behind it: pick one, or type any
 * face you have installed. An empty field means the theme's own face.
 */
export function FontPicker() {
  const [fonts, setFonts] = useState<Fonts>(rememberedFonts);
  const update = (patch: Partial<Fonts>) => {
    const next = { ...fonts, ...patch };
    setFonts(next);
    applyFonts(next);
  };

  return (
    <section>
      <div className="side-head">{t("Fonts")}</div>
      <FontRow label={t("Interface")} list="ukemi-ui-fonts" value={fonts.ui} onChange={(ui) => update({ ui })} />
      <FontRow label={t("Code")} list="ukemi-mono-fonts" value={fonts.mono} onChange={(mono) => update({ mono })} mono />
      <datalist id="ukemi-ui-fonts">
        {UI_FONT_SUGGESTIONS.map((face) => <option key={face} value={face} />)}
      </datalist>
      <datalist id="ukemi-mono-fonts">
        {MONO_FONT_SUGGESTIONS.map((face) => <option key={face} value={face} />)}
      </datalist>
    </section>
  );
}

function FontRow({
  label,
  list,
  value,
  mono,
  onChange,
}: {
  label: string;
  list: string;
  value: string;
  mono?: boolean;
  onChange(value: string): void;
}) {
  return (
    <div className="side-item" style={{ gap: 8 }}>
      <span className="sec" style={{ width: 72, flexShrink: 0 }}>{label}</span>
      <input
        className={mono ? "mono selectable" : "selectable"}
        list={list}
        value={value}
        spellCheck={false}
        aria-label={label}
        placeholder={t("Theme default")}
        onChange={(event) => onChange(event.target.value)}
        // Text entry owns its keys; the window's map must not see them.
        onKeyDown={(event) => event.stopPropagation()}
        style={{
          flexGrow: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "inherit",
        }}
      />
    </div>
  );
}
