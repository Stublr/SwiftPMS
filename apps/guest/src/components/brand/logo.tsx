import { cn } from "@/lib/utils";

type Tone = "dark" | "light";

/**
 * ALGAFUSION chevron mark — three nested peaks (tent / mountain / "A")
 * echoing the brand identity. On a light surface the middle peak reads as
 * deep forest green; on a dark surface it flips to cream.
 */
export function BrandMark({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: Tone;
}) {
  const middle = tone === "light" ? "#f4f1e8" : "#103d2f";
  return (
    <svg
      viewBox="0 0 48 44"
      fill="none"
      className={className}
      role="img"
      aria-label="ALGAFUSION"
    >
      <g strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M5 39 L24 8 L43 39" stroke="#e2742b" strokeWidth="6.5" />
        <path d="M11 39 L24 17.5 L37 39" stroke={middle} strokeWidth="6.5" />
        <path d="M17.5 39 L24 27 L30.5 39" stroke="#84bf3f" strokeWidth="6" />
      </g>
    </svg>
  );
}

/**
 * Full lockup: chevron mark + ALGAFUSION wordmark + optional tagline.
 */
export function Logo({
  tone = "dark",
  showTagline = true,
  className,
  markClassName,
}: {
  tone?: Tone;
  showTagline?: boolean;
  className?: string;
  markClassName?: string;
}) {
  const wordmark = tone === "light" ? "text-primary-foreground" : "text-primary";
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark tone={tone} className={cn("h-8 w-8 shrink-0", markClassName)} />
      <span className="flex flex-col justify-center leading-none">
        <span
          className={cn(
            "text-lg font-bold tracking-[0.14em]",
            wordmark,
          )}
        >
          ALGAFUSION
        </span>
        {showTagline && (
          <span className="mt-1 text-[0.5rem] font-semibold uppercase tracking-[0.3em] text-accent">
            The Architecture of Escape
          </span>
        )}
      </span>
    </span>
  );
}
