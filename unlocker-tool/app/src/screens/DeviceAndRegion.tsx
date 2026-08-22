import { useState } from "react";
import { api } from "../api";
import { Eyebrow, Heading, PrimaryButton } from "../components/ui";
import type { Locale, Model } from "../types";

export function DeviceAndRegion() {
  const [model, setModel] = useState<Model | null>(null);
  const [locale, setLocale] = useState<Locale | null>(null);

  const ready = model && locale;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow>Step 2 · Your device</Eyebrow>
          <Heading>Which Xteink do you have?</Heading>
        </div>
        <PrimaryButton
          disabled={!ready}
          onClick={() => model && locale && api.selectDevice(model, locale)}
        >
          Continue
        </PrimaryButton>
      </div>

      <div className="space-y-4">
        <Section title="Model" hint="">
          <DeviceCard
            title="Xteink X3"
            selected={model === "x3"}
            onClick={() => setModel("x3")}
          />
          <DeviceCard
            title="Xteink X4"
            selected={model === "x4"}
            onClick={() => setModel("x4")}
          />
          <DeviceCard
            title="Xteink X4 Pro"
            subtitle="ESP32-S3 · encrypted OTA"
            selected={model === "x4pro"}
            onClick={() => setModel("x4pro")}
          />
        </Section>

        <Section
          title="Region"
          hint="Which language did your device come with from the factory?"
        >
          <DeviceCard
            title="English"
            subtitle="Overseas firmware"
            selected={locale === "english"}
            onClick={() => setLocale("english")}
          />
          <DeviceCard
            title="Chinese"
            subtitle="Domestic firmware"
            selected={locale === "chinese"}
            onClick={() => setLocale("chinese")}
          />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-base font-medium text-stone-900">
          {title}
        </h2>
        {hint && <p className="text-xs text-stone-500">{hint}</p>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function DeviceCard({
  title,
  subtitle,
  selected,
  onClick,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-3 text-left shadow-sm transition ${
        selected
          ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
          : "border-stone-300 bg-white hover:border-stone-400"
      }`}
    >
      <div className="font-serif text-base font-medium text-stone-900">
        {title}
      </div>
      {subtitle && (
        <div className="mt-0.5 text-sm text-stone-500">{subtitle}</div>
      )}
    </button>
  );
}
