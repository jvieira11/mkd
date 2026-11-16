import type { Converter, ConverterOptionValues } from "@/converters/types";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface OptionsPanelProps {
  converter: Converter;
  values: ConverterOptionValues;
  disabled?: boolean;
  onChange: (values: ConverterOptionValues) => void;
}

/** Renderiza automaticamente as opções declaradas por um conversor. */
export function OptionsPanel({ converter, values, disabled, onChange }: OptionsPanelProps) {
  const options = converter.options ?? [];
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">Este formato não tem opções.</p>;
  }

  return (
    <div className="space-y-4">
      {options.map((opt) => {
        const id = `opt-${converter.id}-${opt.key}`;
        if (opt.type === "boolean") {
          return (
            <div key={opt.key} className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor={id}>{opt.label}</Label>
                {opt.description && (
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                )}
              </div>
              <Switch
                id={id}
                disabled={disabled}
                checked={Boolean(values[opt.key])}
                onCheckedChange={(checked) => onChange({ ...values, [opt.key]: checked })}
              />
            </div>
          );
        }
        return (
          <div key={opt.key} className="space-y-1.5">
            <Label htmlFor={id}>{opt.label}</Label>
            {opt.description && <p className="text-xs text-muted-foreground">{opt.description}</p>}
            <select
              id={id}
              disabled={disabled}
              value={String(values[opt.key] ?? opt.default)}
              onChange={(e) => onChange({ ...values, [opt.key]: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {opt.choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
