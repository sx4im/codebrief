// Clerk's hosted components are themed to the cream/orange system (DESIGN.md).
// Lives in its own module (not AuthShell.tsx) so the component file exports only
// components and React Fast Refresh boundaries stay intact.
export const clerkAuthAppearance = {
  variables: {
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#202020",
    colorPrimary: "#ea2804",
    colorText: "#202020",
    colorTextSecondary: "#646464",
    borderRadius: "10px",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
  },
  elements: {
    cardBox: "border border-[rgba(32,32,32,0.12)] bg-white shadow-soft",
    card: "bg-white shadow-none",
    headerTitle: "font-display text-[#202020]",
    headerSubtitle: "text-[#646464]",
    socialButtonsBlockButton: "rounded-full border-[rgba(32,32,32,0.2)] bg-white text-[#202020] hover:bg-[#f3f0e8]",
    formButtonPrimary: "rounded-full bg-[#ea2804] text-white hover:bg-[#c01f00]",
    formFieldInput: "rounded-full border-[rgba(32,32,32,0.2)] bg-white text-[#202020]",
    footerActionText: "text-[#646464]",
    footerActionLink: "text-[#ea2804]",
  },
};
