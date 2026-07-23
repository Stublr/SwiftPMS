/**
 * Set the Sugarloaf Campsite seasonal tariff (effective 1 September 2026) on
 * every room type, from the "Sugarloaf 2026/2027 Seasonal Tariff Schedule".
 *
 *   Standard: R450 base (up to 2 people), R200/extra person, R100/child <3
 *   Peak:     R1 200 base (up to 4 people), R300/extra person, R150/child <3
 *   Peak season = the four holiday windows below (priced per night).
 *
 * The pricing engine (resolveStayPricing) charges each night at its own
 * season's tier, so a stay straddling a boundary is split automatically.
 *
 * Usage:
 *   # Dry run — prints the plan, writes nothing (DEFAULT):
 *   GOOGLE_APPLICATION_CREDENTIALS=./firebase-admin-key.json npx tsx scripts/set-sugarloaf-rates.ts
 *
 *   # Apply for real — SAFE TO RUN NOW. effectiveFrom gates the new card to
 *   # 1 Sept 2026, so advance bookings for that period price correctly while
 *   # stays before it keep the current rate:
 *   GOOGLE_APPLICATION_CREDENTIALS=./firebase-admin-key.json npx tsx scripts/set-sugarloaf-rates.ts --apply
 *
 *   # Restrict to one tenant (otherwise every tenant's room types are updated):
 *   TENANT_ID=tenant_xxx npx tsx scripts/set-sugarloaf-rates.ts --apply
 *
 * Auth: a service-account key (GOOGLE_APPLICATION_CREDENTIALS or
 * ../firebase-admin-key.json), or Application Default Credentials
 * (`gcloud auth application-default login`).
 * Idempotent — safe to re-run.
 */

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = process.env.GCLOUD_PROJECT || "swiftpms-prod";
const APPLY = process.argv.includes("--apply");
const ONLY_TENANT = process.env.TENANT_ID || null;

// All money in integer cents. R450.00 => 45000.
const SUGARLOAF_TIERED = {
  childAgeMax: 2, // "children under 3 years" — label derives as childAgeMax + 1
  standard: {
    baseRate: 45_000, // R450 — up to 2 people
    basePersonCount: 2,
    extraAdult: 20_000, // R200 per additional person
    extraChild: 10_000, // R100 per child under 3
  },
  high: {
    baseRate: 120_000, // R1 200 — up to 4 people
    basePersonCount: 4,
    extraAdult: 30_000, // R300 per additional person
    extraChild: 15_000, // R150 per child under 3
  },
  // Peak windows (inclusive, YYYY-MM-DD). Priced per night.
  peakRanges: [
    { start: "2026-09-10", end: "2026-10-10" }, // School holidays
    { start: "2026-12-11", end: "2027-01-11" }, // Summer holidays
    { start: "2027-03-19", end: "2027-04-05" }, // Easter holidays
    { start: "2027-04-23", end: "2027-05-03" }, // Freedom Day holidays
  ],
  // Only prices stays checking in on/after this date. Earlier check-ins keep
  // the room type's existing flat baseRate (the current/previous rate) — so
  // advance bookings for the new season price correctly without repricing the
  // current season. Safe to load ahead of the cutover.
  effectiveFrom: "2026-09-01",
} as const;

// Prefer an explicit service-account key; otherwise fall back to Application
// Default Credentials (gcloud auth application-default login / firebase login)
// so this can run against prod without a key file.
const keyPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  resolve(__dirname, "../firebase-admin-key.json");

initializeApp({
  credential: existsSync(keyPath)
    ? cert(JSON.parse(readFileSync(keyPath, "utf8")))
    : applicationDefault(),
  projectId: PROJECT_ID,
});

const db = getFirestore();

const rand = (cents: number) => `R${(cents / 100).toFixed(2)}`;

async function run() {
  console.log(`\nProject: ${PROJECT_ID}`);
  console.log(`Mode:    ${APPLY ? "APPLY (writing changes)" : "DRY RUN (no writes)"}`);
  console.log(ONLY_TENANT ? `Tenant:  ${ONLY_TENANT} (restricted)` : "Tenant:  ALL tenants");
  console.log("\nPlanned tariff:");
  console.log(`  Standard: ${rand(SUGARLOAF_TIERED.standard.baseRate)} base (${SUGARLOAF_TIERED.standard.basePersonCount} ppl), ` +
    `${rand(SUGARLOAF_TIERED.standard.extraAdult)}/extra, ${rand(SUGARLOAF_TIERED.standard.extraChild)}/child<3`);
  console.log(`  Peak:     ${rand(SUGARLOAF_TIERED.high.baseRate)} base (${SUGARLOAF_TIERED.high.basePersonCount} ppl), ` +
    `${rand(SUGARLOAF_TIERED.high.extraAdult)}/extra, ${rand(SUGARLOAF_TIERED.high.extraChild)}/child<3`);
  console.log(`  Peak windows: ${SUGARLOAF_TIERED.peakRanges.map((r) => `${r.start}→${r.end}`).join(", ")}`);
  console.log(`  Effective from: ${SUGARLOAF_TIERED.effectiveFrom} — earlier check-ins keep each room type's current baseRate`);

  const tenantDocs = ONLY_TENANT
    ? [await db.collection("tenants").doc(ONLY_TENANT).get()].filter((d) => d.exists)
    : (await db.collection("tenants").get()).docs;

  if (tenantDocs.length === 0) {
    console.error("\nNo tenants found. Nothing to do.");
    process.exit(1);
  }

  let updated = 0;
  let warnings = 0;

  for (const tenant of tenantDocs) {
    const roomTypesSnap = await db.collection(`tenants/${tenant.id}/roomTypes`).get();
    console.log(`\n── tenant ${tenant.id} (${tenant.data().name ?? "?"}) — ${roomTypesSnap.size} room type(s)`);

    for (const rt of roomTypesSnap.docs) {
      const d = rt.data();
      const hadTiered = !!d.tieredPricing;
      console.log(
        `   • ${d.name ?? rt.id}: baseRate ${rand(d.baseRate ?? 0)} (kept); ` +
          `tieredPricing ${hadTiered ? "REPLACED" : "ADDED"} (effective ${SUGARLOAF_TIERED.effectiveFrom})`,
      );
      if (hadTiered) {
        const t = d.tieredPricing;
        console.log(
          `     was: std ${rand(t.standard?.baseRate ?? 0)}/${t.standard?.basePersonCount ?? "?"}ppl` +
            ` (+${rand(t.standard?.extraAdult ?? 0)}/adult, +${rand(t.standard?.extraChild ?? 0)}/child),` +
            ` high ${rand(t.high?.baseRate ?? 0)}/${t.high?.basePersonCount ?? "?"}ppl,` +
            ` childAgeMax ${t.childAgeMax}, effectiveFrom ${t.effectiveFrom ?? "—"},` +
            ` ${(t.peakRanges ?? []).length} peak window(s)`,
        );
      }

      // A rate period whose window overlaps the new peak windows would OVERRIDE
      // this tiered pricing for check-ins inside it (resolveStayPricing checks
      // periods first). Flag so it can be reviewed — this script never touches
      // ratePeriods.
      if (Array.isArray(d.ratePeriods) && d.ratePeriods.length > 0) {
        warnings++;
        console.log(
          `     ⚠ has ${d.ratePeriods.length} rate period(s) that still override tiered pricing: ` +
            d.ratePeriods.map((p: { name?: string; start: string; end: string }) => `"${p.name ?? "?"}" ${p.start}→${p.end}`).join(", "),
        );
      }

      if (APPLY) {
        await rt.ref.update({
          tieredPricing: SUGARLOAF_TIERED,
          updatedAt: new Date().toISOString(),
        });
        updated++;
      }
    }
  }

  console.log(
    `\n${APPLY ? `Done. Updated ${updated} room type(s).` : "Dry run complete. Re-run with --apply to write."}` +
      (warnings ? ` (${warnings} rate-period warning(s) above — review before/after applying.)` : ""),
  );
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
