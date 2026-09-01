/**
 * Participant support channels.
 *
 * master_prompt.md §17, §20 and §63: there is deliberately no self-service
 * password recovery and no self-service identity replacement. Whenever a
 * participant cannot get in, the only route forward is a human, so these
 * details must be reachable from every failure surface.
 */

export const SUPPORT_EMAIL = "collabwinwin@gmail.com";

/** Display form, as the administrator gives it out. */
export const SUPPORT_WHATSAPP_DISPLAY = "9819927007";

/** wa.me requires the full international number without punctuation. */
const SUPPORT_WHATSAPP_INTERNATIONAL = "919819927007";

export function supportEmailHref(subject = "Passion Analyzer — trouble signing in"): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export function supportWhatsAppHref(
  message = "Hello, I need help signing in to the Passion Analyzer.",
): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_INTERNATIONAL}?text=${encodeURIComponent(message)}`;
}
