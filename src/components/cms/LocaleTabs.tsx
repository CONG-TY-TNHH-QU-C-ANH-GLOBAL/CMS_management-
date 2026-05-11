import type { ReactNode } from "react";

export type Locale = "en" | "vi" | "zh";

const LOCALE_META: Record<Locale, { label: string; flag: string }> = {
  en: { label: "English", flag: "🇺🇸" },
  vi: { label: "Tiếng Việt", flag: "🇻🇳" },
  zh: { label: "中文", flag: "🇨🇳" },
};

interface Props {
  value: Locale;
  onChange: (locale: Locale) => void;
  rightSlot?: ReactNode;
}

export function LocaleTabs({ value, onChange, rightSlot }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
      <div className="flex gap-1">
        {(["en", "vi", "zh"] as Locale[]).map((loc) => {
          const meta = LOCALE_META[loc];
          const active = value === loc;
          return (
            <button
              key={loc}
              onClick={() => onChange(loc)}
              className={[
                "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium transition",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-surface-muted",
              ].join(" ")}
            >
              <span className="text-sm">{meta.flag}</span>
              {meta.label}
            </button>
          );
        })}
      </div>
      {rightSlot}
    </div>
  );
}
