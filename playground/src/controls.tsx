import { useId, useState, type ReactNode } from "react";
import type { EffectParamDef, ParamValue } from "instantshader";

// Small, uniform controls. Every slider track is painted with the live
// palette ramp (the --ramp custom property set by Studio), so the panel
// always shows the colours being worked on.

export function Slider({
  label,
  min,
  max,
  step,
  value,
  defaultValue,
  onChange,
  readout,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  defaultValue?: number;
  onChange: (v: number) => void;
  readout?: string;
}) {
  const id = useId();
  // Decimals follow the step, so an integer knob doesn't read "28.00".
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const changed = defaultValue !== undefined && Math.abs(value - defaultValue) > step / 2;
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id} className={changed ? "changed" : undefined}>
          {label}
        </label>
        {changed ? (
          <button
            type="button"
            className="reset-one"
            title="Back to default"
            aria-label={`Reset ${label}`}
            onClick={() => onChange(defaultValue!)}
          >
            ↺
          </button>
        ) : null}
        <output htmlFor={id}>{readout ?? value.toFixed(decimals)}</output>
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      {label ? <div className="field-head"><span className="label">{label}</span></div> : null}
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? "on" : undefined}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Select({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
      </div>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} className="toggle" onClick={() => onChange(!value)}>
      <span className="toggle-track" aria-hidden />
      {label}
    </button>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="field color-field">
      <label htmlFor={id}>{label}</label>
      <span className="chip" style={{ background: value }}>
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
      <code>{value}</code>
    </div>
  );
}

/** One control for one effect param, picked by type. Enums with few short
 * options become a segmented control, the rest a select. */
export function ParamControl({
  def,
  value,
  onChange,
}: {
  def: EffectParamDef;
  value: ParamValue;
  onChange: (v: ParamValue) => void;
}) {
  if (def.type === "enum") {
    const short = def.options.length <= 3 && def.options.every((o) => o.label.length <= 9);
    return short ? (
      <Segmented label={def.label} options={def.options} value={value as string} onChange={onChange} />
    ) : (
      <Select label={def.label} options={def.options} value={value as string} onChange={onChange} />
    );
  }
  if (def.type === "bool") return <Toggle label={def.label} value={value as boolean} onChange={onChange} />;
  if (def.type === "color") return <ColorField label={def.label} value={value as string} onChange={onChange} />;
  return (
    <Slider
      label={def.label}
      min={def.min}
      max={def.max}
      step={def.step}
      value={value as number}
      defaultValue={def.default}
      onChange={onChange}
    />
  );
}

/** A titled group that can fold. */
export function Group({
  title,
  aside,
  defaultOpen = true,
  children,
}: {
  title: string;
  aside?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={open ? "group open" : "group"}>
      <header>
        <button type="button" className="group-title" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="caret" aria-hidden />
          {title}
        </button>
        {aside}
      </header>
      {open ? <div className="group-body">{children}</div> : null}
    </section>
  );
}
