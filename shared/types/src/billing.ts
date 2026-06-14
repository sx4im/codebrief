import { z } from "zod";

// Codebrief is free with no paid tiers or usage gating. The `plan` column is
// retained for data compatibility and defaults to "free"; there are no limits
// to enforce. Older rows that still say "pro"/"agency" remain valid values.
export const PlanSchema = z.enum(["free", "pro", "agency"]);
export type Plan = z.infer<typeof PlanSchema>;
