import { cn } from "@/lib/utils";

/**
 * Identidade do mkd: cerquilha (#, título em Markdown) cuja haste direita vira
 * uma seta para baixo (conversão). Formas geométricas puras, nítidas em qualquer tamanho.
 * Arquivos estáticos equivalentes em /public/brand.
 */

export function LogoIcon({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <rect width="64" height="64" rx="14" fill="#0B1220" />
      <g fill="#F8FAFC">
        <rect x="18" y="11" width="7" height="32" />
        <rect x="10" y="18" width="40" height="7" />
        <rect x="10" y="30" width="22" height="7" />
      </g>
      <g fill="#10B981">
        <rect x="35" y="11" width="7" height="27" />
        <path d="M28.5 35.5h20L38.5 53z" />
      </g>
    </svg>
  );
}

/** Palavra "mkd" desenhada com traços geométricos; usa a cor do texto atual. */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 87 50"
      className={cn("shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      aria-hidden
    >
      <path d="M3 44V29a7 7 0 0 1 14 0v15M17 29a7 7 0 0 1 14 0v15" />
      <path d="M41 6v38" />
      <path d="M43 34.5 57 22.5" />
      <path d="M47.5 31 58 44" />
      <circle cx="73" cy="33" r="8" />
      <path d="M84 6v38" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoIcon className="h-8 w-8 rounded-[22%] dark:ring-1 dark:ring-white/15" />
      <LogoWordmark className="h-[22px] w-auto translate-y-[1px]" />
      <span className="sr-only">mkd</span>
    </span>
  );
}
