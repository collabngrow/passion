import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button system.
 *
 * brand_guidelines.md §9:
 *  - primary   rose background, white text
 *  - secondary white background, rose border and text
 *  - onBrand   white background, rose text, for use on rose surfaces
 *
 * Corners are subtly rounded rather than pill-shaped, and every variant keeps a
 * comfortable touch target (§9, §24).
 */

type Variant = "primary" | "secondary" | "onBrand" | "quiet";
type Size = "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-on-brand hover:bg-brand-dark active:bg-brand-dark " +
    "disabled:bg-brand/50",
  secondary:
    "bg-surface text-brand border border-brand hover:bg-brand-soft " +
    "disabled:border-line disabled:text-ink-soft",
  onBrand:
    "bg-surface text-brand hover:bg-brand-soft disabled:bg-surface/60 " +
    "disabled:text-ink-soft",
  quiet:
    "bg-transparent text-ink-soft hover:text-ink hover:bg-brand-soft " +
    "disabled:text-line-strong",
};

const SIZES: Record<Size, string> = {
  md: "min-h-11 px-5 text-[0.9375rem]",
  lg: "min-h-13 px-7 text-base",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-md font-medium",
        "transition-colors duration-150",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
