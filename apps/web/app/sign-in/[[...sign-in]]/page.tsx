import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { AuthShell, ClerkConfigurationNotice, clerkAuthAppearance } from "@/components/auth/AuthShell";
import { isClerkConfigured } from "@/lib/auth/config";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to Codebrief to run GitHub repository analyses.",
};

export default function SignInPage() {
  return (
    <AuthShell
      title="Sign in before the pipeline touches a repository."
      subtitle="Codebrief connects a GitHub identity to analysis records, repo access, usage limits, and client-ready exports."
    >
      {isClerkConfigured() ? (
        <SignIn
          appearance={clerkAuthAppearance}
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/dashboard"
        />
      ) : (
        <ClerkConfigurationNotice />
      )}
    </AuthShell>
  );
}
