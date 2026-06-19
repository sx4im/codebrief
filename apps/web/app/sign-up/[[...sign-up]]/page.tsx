import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { AuthShell, ClerkConfigurationNotice } from "@/components/auth/AuthShell";
import { clerkAuthAppearance } from "@/components/auth/clerkAppearance";
import { isClerkConfigured } from "@/lib/auth/config";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a Codebrief account to start a sourced technical brief.",
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create the workspace for your first codebase handoff."
      subtitle="Start with a public repository, then add GitHub OAuth for private analyses once credentials are configured."
    >
      {isClerkConfigured() ? (
        <SignUp
          appearance={clerkAuthAppearance}
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/projects/new"
        />
      ) : (
        <ClerkConfigurationNotice />
      )}
    </AuthShell>
  );
}
