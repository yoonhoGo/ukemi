import { useSyncExternalStore } from "react";
import { applyLocale, currentLocale, LOCALES, subscribeLocale, t } from "../i18n/i18n.ts";

/**
 * Language switch, sitting under the theme one.
 *
 * Each language is listed in its own name, because a picker written in a
 * language you cannot read is no help to the person who needs it.
 */
export function LanguagePicker() {
  const active = useSyncExternalStore(subscribeLocale, currentLocale);

  return (
    <div style={{ paddingTop: 10 }}>
      <div className="side-head" style={{ padding: "0 8px 4px" }}>
        {t("Language")}
      </div>
      {LOCALES.map((locale) => (
        <button
          type="button"
          className="side-item"
          key={locale.id}
          aria-current={locale.id === active}
          onClick={() => applyLocale(locale.id)}
        >
          <span style={{ flexGrow: 1 }} lang={locale.id}>
            {locale.name}
          </span>
        </button>
      ))}
    </div>
  );
}
