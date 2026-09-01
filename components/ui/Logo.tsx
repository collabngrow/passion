import Image from "next/image";

import logo from "@/public/brand/logo.png";

const SIZES = {
  sm: 32,
  md: 48,
  lg: 72,
  xl: 112,
} as const;

type LogoProps = {
  size?: keyof typeof SIZES;
  /**
   * The logo already carries the wordmark, so it is decorative wherever the
   * brand name appears in adjacent text. Pass a label only when it is the sole
   * identification of the brand on screen.
   */
  label?: string;
  priority?: boolean;
  className?: string;
};

/**
 * The supplied CollabNGrow mark.
 *
 * brand_guidelines.md §7: use the supplied asset, never a CSS recreation, and
 * never distort, rotate or recolour it. Only uniform scaling is permitted here.
 */
export function Logo({
  size = "md",
  label,
  priority = false,
  className = "",
}: LogoProps) {
  const px = SIZES[size];

  return (
    <Image
      src={logo}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      width={px}
      height={px}
      priority={priority}
      className={`rounded-md ${className}`}
    />
  );
}
