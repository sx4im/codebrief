import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Pill controls per DESIGN.md (rounded.full, 44px default). Variant keys are kept
// stable (primary/secondary/danger/ghost) so existing call sites don't change;
// `dark` is added for the equal-weight dark CTA.
const variants = {
  primary: "h-11 px-6 bg-primary text-white hover:bg-primary-deep",
  dark: "h-11 px-6 bg-surface-dark text-on-dark hover:bg-black",
  secondary: "h-11 px-6 bg-card text-ink border border-ink/20 hover:border-ink/40 hover:bg-bone",
  danger: "h-11 px-6 bg-danger text-white hover:bg-primary-deep",
  ghost: "h-9 px-4 bg-transparent text-charcoal hover:text-ink hover:bg-bone",
};

const base =
  "focus-ring inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-full text-sm font-semibold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export function ButtonLink({
  className,
  variant = "primary",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: keyof typeof variants }) {
  return <Link className={cn(base, variants[variant], className)} {...props} />;
}
