import {
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
  supportEmailHref,
  supportWhatsAppHref,
} from "@/lib/support";

/**
 * Trouble Signing In.
 *
 * master_prompt.md §17, §20 and §63. There is deliberately no password reset,
 * no forgotten-password flow and no self-service identity replacement, so this
 * is the only way forward for someone who is stuck — it must be present
 * wherever entry can fail, and it must reach a human.
 */

type TroubleSigningInProps = {
  /** Included in the prefilled message so support knows which invitation. */
  inviteId?: string;
  className?: string;
};

export function TroubleSigningIn({ inviteId, className = "" }: TroubleSigningInProps) {
  const reference = inviteId ? ` (reference: ${inviteId})` : "";

  return (
    <div
      className={`rounded-lg border border-line bg-surface px-5 py-5 ${className}`}
    >
      <h2 className="text-sm font-semibold text-ink">Trouble signing in?</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Invitations are personal, so we can&apos;t reset them automatically. Get in
        touch and we&apos;ll sort it out with you.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <a
          href={supportEmailHref(`Passion Analyzer — trouble signing in${reference}`)}
          className={
            "inline-flex min-h-11 flex-1 items-center justify-center rounded-md " +
            "border border-brand px-4 text-sm font-medium text-brand " +
            "transition-colors duration-150 hover:bg-brand-soft"
          }
        >
          Email {SUPPORT_EMAIL}
        </a>
        <a
          href={supportWhatsAppHref(
            `Hello, I need help signing in to the Passion Analyzer${reference}.`,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className={
            "inline-flex min-h-11 flex-1 items-center justify-center rounded-md " +
            "border border-brand px-4 text-sm font-medium text-brand " +
            "transition-colors duration-150 hover:bg-brand-soft"
          }
        >
          WhatsApp {SUPPORT_WHATSAPP_DISPLAY}
        </a>
      </div>
    </div>
  );
}
