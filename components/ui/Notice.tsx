import type { ReactNode } from "react";

/**
 * Inline message.
 *
 * brand §24 and master_prompt §73: state is never carried by colour alone, so
 * each tone pairs its colour with a visible text prefix and an appropriate ARIA
 * role. Errors assert, so a screen reader announces them immediately.
 */

type Tone = "error" | "info" | "success";

const TONES: Record<Tone, { box: string; prefix: string }> = {
  error: {
    box: "border-critical/30 bg-critical/5 text-ink",
    prefix: "Problem",
  },
  info: {
    box: "border-line bg-brand-soft text-ink",
    prefix: "Note",
  },
  success: {
    box: "border-positive/30 bg-positive/5 text-ink",
    prefix: "Done",
  },
};

export function Notice({
  tone = "info",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const { box, prefix } = TONES[tone];

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border px-4 py-3 text-sm leading-relaxed ${box} ${className}`}
    >
      <span className="font-semibold">{prefix}: </span>
      {children}
    </div>
  );
}
