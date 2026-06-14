import { SignedIn, UserButton } from "@clerk/nextjs";
import { FileSearch, Home, Plus, Settings } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { isClerkConfigured } from "@/lib/auth/config";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/projects/new", label: "New analysis", icon: Plus },
  { href: "/demo", label: "Demo briefs", icon: FileSearch },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const clerkConfigured = isClerkConfigured();

  return (
    <aside className="hidden min-h-screen w-64 flex-col border-r border-border bg-panel lg:flex">
      <div className="border-b border-border px-5 py-5">
        <div className="font-mono text-lg font-semibold text-text">Codebrief</div>
        <div className="mt-1 text-xs text-muted">technical handoff briefs</div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => (
          <ButtonLink key={item.href} href={item.href} variant="ghost" className="w-full justify-start">
            <item.icon className="h-4 w-4" />
            {item.label}
          </ButtonLink>
        ))}
      </nav>
      {clerkConfigured ? (
        <SignedIn>
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-3">
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "h-8 w-8",
                  },
                }}
              />
              <div className="min-w-0">
                <div className="font-mono text-xs uppercase text-muted">Signed in</div>
                <div className="text-sm text-text">Account</div>
              </div>
            </div>
          </div>
        </SignedIn>
      ) : (
        <div className="border-t border-border p-4">
          <div className="font-mono text-xs uppercase text-amber">Auth not configured</div>
          <p className="mt-1 text-xs leading-5 text-muted">Add Clerk keys to enable protected workspace sessions.</p>
        </div>
      )}
    </aside>
  );
}
