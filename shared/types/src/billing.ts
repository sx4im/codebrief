import { z } from "zod";

// Codebrief gives every account a small number of free analyses, after which a
// one-time payment unlocks lifetime access. The `plan` column stores the
// entitlement: "lifetime" = paid (unlimited), everything else is treated as the
// free tier. Legacy "pro"/"agency" rows remain valid for data compatibility.
export const PlanSchema = z.enum(["free", "pro", "agency", "lifetime"]);
export type Plan = z.infer<typeof PlanSchema>;

// Free accounts may run this many analyses before the lifetime upgrade is
// required. One-time price for unlimited lifetime access, in USD.
export const FREE_ANALYSIS_LIMIT = 3;
export const LIFETIME_PRICE_USD = 50;
