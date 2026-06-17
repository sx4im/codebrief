import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Nike pill CTAs per DESIGN.md: black primary, soft-cloud secondary, full pill,
// ~48px height. Variant keys stay stable so existing call sites don't change.
const variants = {
  primary: "h-12 px-8 bg-primary text-white hover:bg-primary-deep",
  dark: "h-12 px-8 bg-surface-dark text-on-dark hover:bg-black",
  secondary: "h-12 px-8 bg-bone text-ink hover:bg-stone/40",
  danger: "h-12 px-8 bg-danger text-white hover:opacity-90",
  ghost: "h-9 px-4 bg-transparent text-charcoal hover:text-ink hover:bg-bone",
};

// rounded-full pill, with Nike's subtle tap-collapse on press.
const base =
  "focus-ring inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-full text-sm font-semibold leading-none transition-[transform,background-color,color] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50";

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
