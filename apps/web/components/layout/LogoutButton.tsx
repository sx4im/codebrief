"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

// ponytail: useClerk().signOut() avoids <SignOutButton>'s React.Children.only,
// which throws when a Server Component passes a styled child across the RSC boundary.
export function LogoutButton() {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectUrl: "/" })}
      className="focus-ring mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-charcoal transition-colors hover:bg-bone hover:text-ink"
    >
      <LogOut className="h-4 w-4" />
      Log out
    </button>
  );
}
