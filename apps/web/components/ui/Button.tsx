import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-blue text-white hover:bg-blue/90 border-blue",
  secondary: "bg-panel2 text-text hover:bg-panel border-border",
  danger: "bg-danger text-white hover:bg-danger/90 border-danger",
  ghost: "bg-transparent text-muted hover:text-text hover:bg-panel border-transparent",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({
  className,
  variant = "primary",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: keyof typeof variants }) {
  return (
    <Link
      className={cn(
        "focus-ring inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded border px-4 text-sm font-semibold transition-colors",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
