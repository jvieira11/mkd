import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Converter, ConverterOption, ConverterOptionValues } from "@/converters/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface OptionsPanelProps {
  converter: Converter;
  values: ConverterOptionValues;
  disabled?: boolean;
  onChange: (values: ConverterOptionValues) => void;
}

const isVisible = (opt: ConverterOption, values: ConverterOptionValues) =>
  !opt.showWhen || values[opt.showWhen.key] === opt.showWhen.equals;

function errorOf(opt: ConverterOption, values: ConverterOptionValues): string | null {
  if (opt.type !== "text" || !opt.validate || !isVisible(opt, values)) return null;
  return opt.validate(String(values[opt.key] ?? ""));
}

const sameValues = (a: ConverterOptionValues, b: ConverterOptionValues) =>
  Object.keys({ ...a, ...b }).every((k) => a[k] === b[k]);

/**
 * Renderiza automaticamente as opções declaradas por um conversor.
 * As mudanças ficam num rascunho e só reconvertem o arquivo quando todas as opções
 * visíveis são válidas (ex.: o intervalo de páginas digitado).
 */
export function OptionsPanel({ converter, values, disabled, onChange }: OptionsPanelProps) {
  const options = converter.options ?? [];
  const [draft, setDraft] = useState(values);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => setDraft(values), [values]);

  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">Este formato não tem opções.</p>;
  }

  const commit = (next: ConverterOptionValues) => {
    setDraft(next);
    const valid = options.every((opt) => !errorOf(opt, next));
    if (valid && !sameValues(next, values)) onChange(next);
  };

  return (
    <div className="space-y-4">
      {options.map((opt) => {
        if (!isVisible(opt, draft)) return null;
        const id = `opt-${converter.id}-${opt.key}`;
        const description = opt.description && (
          <p id={`${id}-desc`} className="text-xs text-muted-foreground">
            {opt.description}
          </p>
        );

        if (opt.type === "boolean") {
          return (
            <div key={opt.key} className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor={id}>{opt.label}</Label>
                {description}
              </div>
              <Switch
                id={id}
                disabled={disabled}
                checked={Boolean(draft[opt.key])}
                onCheckedChange={(checked) => commit({ ...draft, [opt.key]: checked })}
              />
            </div>
          );
        }

        if (opt.type === "text") {
          const value = String(draft[opt.key] ?? "");
          const error = errorOf(opt, draft);
          const showError = error && (touched[opt.key] || value.trim() !== "");
          const pending = !error && value !== String(values[opt.key] ?? "");
          const apply = () => {
            setTouched((t) => ({ ...t, [opt.key]: true }));
            commit(draft);
          };
          return (
            <div key={opt.key} className="space-y-1.5">
              <Label htmlFor={id}>{opt.label}</Label>
              {description}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  apply();
                }}
              >
                <input
                  id={id}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={disabled}
                  value={value}
                  placeholder={opt.placeholder}
                  aria-invalid={Boolean(showError)}
                  aria-describedby={`${id}-desc ${id}-error`}
                  onChange={(e) => setDraft({ ...draft, [opt.key]: e.target.value })}
                  onBlur={() => value.trim() && apply()}
                  className={cn(
                    "flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                    showError && "border-destructive focus-visible:ring-destructive",
                  )}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant={pending ? "default" : "secondary"}
                  disabled={disabled}
                  className="h-9 shrink-0"
                >
                  <Check /> Aplicar
                </Button>
              </form>
              <p
                id={`${id}-error`}
                role={showError ? "alert" : undefined}
                className={cn("text-xs", showError ? "text-destructive" : "sr-only")}
              >
                {showError ? error : ""}
              </p>
            </div>
          );
        }

        return (
          <div key={opt.key} className="space-y-1.5">
            <Label htmlFor={id}>{opt.label}</Label>
            {description}
            <select
              id={id}
              disabled={disabled}
              value={String(draft[opt.key] ?? opt.default)}
              onChange={(e) => commit({ ...draft, [opt.key]: e.target.value })}
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
