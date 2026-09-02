import { ResumeSignIn } from "@/components/home/ResumeSignIn";
import { Logo } from "@/components/ui/Logo";
import { SUPPORT_EMAIL, supportEmailHref } from "@/lib/support";

/**
 * Public landing surface.
 *
 * The experience is invitation-only (§100), so there is still no sign-up and no
 * way to obtain an invitation here. It reassures someone who arrives without a
 * link that they are in the right place, and points them at a human (§63).
 *
 * It is also where the installed PWA opens (manifest start_url), so it must be
 * able to decide where an existing participant belongs -- <ResumeSignIn/> is
 * the only interactive part of the page, and does that for a returning visitor
 * without ever admitting a stranger.
 */
export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-reading text-center">
        <div className="flex justify-center">
          <Logo size="xl" label="CollabNGrow" priority />
        </div>

        <h1 className="mt-10 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          The Passion Analyzer
        </h1>

        <p className="mt-5 text-lg leading-relaxed text-ink-soft">
          A private space to look honestly at what matters to you, what you want
          to create, and who you are choosing to become.
        </p>

        <div className="mt-12 rounded-lg border border-line bg-brand-soft px-6 py-8 text-left sm:px-8">
          <h2 className="text-base font-semibold text-ink">
            This experience is by invitation
          </h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
            Each invitation is personal, and opens with a link and a password
            sent to you directly. If you have been invited, open the link you
            were given to begin.
          </p>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
            If you were expecting an invitation and cannot find it, write to{" "}
            <a
              href={supportEmailHref("Passion Analyzer — invitation enquiry")}
              className="font-medium text-brand underline underline-offset-4 hover:text-brand-dark"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>

        <ResumeSignIn />
      </div>
    </main>
  );
}
