import { storage } from "./storage";
import { db } from "./db";
import { affiliateReferrals, affiliateCommissions } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export async function calculateCommissionsForInvoice(invoiceId: number): Promise<void> {
  const invoice = await storage.getInvoice(invoiceId);
  if (!invoice || invoice.status !== "paid") return;

  const referral = await storage.getReferralByTenant(invoice.tenantId);
  if (!referral) return;

  if (referral.status !== "active" && referral.status !== "pending") return;

  const affiliate = await storage.getAffiliate(referral.affiliateId);
  if (!affiliate || affiliate.status !== "active") return;

  const programSettings = await storage.getMarketingProgramSettings();

  if (referral.status === "pending") {
    await activateReferralIfRetentionMet(referral.id);
    const updatedReferral = await storage.getReferralByTenant(invoice.tenantId);
    if (!updatedReferral || updatedReferral.status !== "active") return;
  }

  const referralAge = referral.referredAt
    ? Math.floor((Date.now() - new Date(referral.referredAt).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : 0;

  if (referralAge < programSettings.minRetentionMonths && referral.status !== "active") return;

  const model = affiliate.commissionModel;
  let commissionCents = 0;
  let commissionType = "recurring";
  let description = "";

  const period = `${new Date(invoice.periodStart).toISOString().slice(0, 7)}`;

  const existingCommissions = await storage.getCommissionsByAffiliate(affiliate.id, { period });
  const alreadyHasCommissionForInvoice = existingCommissions.some(
    (c) => c.description?.includes(`Invoice #${invoiceId}`)
  );
  if (alreadyHasCommissionForInvoice) return;

  if (model === "recurring") {
    let rate = affiliate.recurringRate ?? programSettings.recurringDefaultRate;

    const tierRate = getTierRate(affiliate.tier, programSettings);
    if (tierRate !== null) {
      rate = tierRate;
    }

    commissionCents = Math.round(invoice.amountCents * rate / 100);
    commissionType = "recurring";
    description = `Recurring commission (${rate}%) on Invoice #${invoiceId}`;
  } else if (model === "hybrid") {
    const previousCommissions = await storage.getCommissionsByAffiliate(affiliate.id);
    const hasUpfront = previousCommissions.some(
      (c) => c.referralId === referral.id && c.type === "upfront"
    );

    if (!hasUpfront) {
      const upfrontAmount = affiliate.hybridUpfrontCents ?? programSettings.hybridDefaultUpfrontCents;
      await storage.createAffiliateCommission({
        affiliateId: affiliate.id,
        referralId: referral.id,
        type: "upfront",
        amountCents: upfrontAmount,
        status: "pending",
        period,
        description: `Upfront bonus for referral (Invoice #${invoiceId})`,
      });
    }

    const recurringRate = affiliate.hybridRecurringRate ?? programSettings.hybridDefaultRecurringRate;
    commissionCents = Math.round(invoice.amountCents * recurringRate / 100);
    commissionType = "recurring";
    description = `Hybrid recurring commission (${recurringRate}%) on Invoice #${invoiceId}`;
  } else if (model === "reseller") {
    const wholesaleCents = affiliate.resellerWholesaleCents ?? programSettings.resellerDefaultWholesaleCents;
    commissionCents = Math.max(0, invoice.amountCents - wholesaleCents);
    commissionType = "margin";
    description = `Reseller margin on Invoice #${invoiceId} (${invoice.amountCents}c - ${wholesaleCents}c wholesale)`;
  }

  if (commissionCents > 0) {
    const autoApprove = referralAge >= programSettings.minRetentionMonths;
    await storage.createAffiliateCommission({
      affiliateId: affiliate.id,
      referralId: referral.id,
      type: commissionType,
      amountCents: commissionCents,
      status: autoApprove ? "approved" : "pending",
      period,
      description,
    });
  }

  await updateAffiliateTiers(affiliate.id);
}

function getTierRate(
  tier: string,
  settings: { tierSilverBonusRate: number; tierGoldBonusRate: number }
): number | null {
  if (tier === "gold") return settings.tierGoldBonusRate;
  if (tier === "silver") return settings.tierSilverBonusRate;
  return null;
}

export async function updateAffiliateTiers(affiliateId: number): Promise<void> {
  const programSettings = await storage.getMarketingProgramSettings();

  const [refCount] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(affiliateReferrals)
    .where(eq(affiliateReferrals.affiliateId, affiliateId));

  const activeCount = refCount?.count ?? 0;

  let newTier = "base";
  if (activeCount >= programSettings.tierGoldThreshold) {
    newTier = "gold";
  } else if (activeCount >= programSettings.tierSilverThreshold) {
    newTier = "silver";
  }

  await storage.updateAffiliate(affiliateId, { tier: newTier });
}

export async function activateReferralIfRetentionMet(referralId: number): Promise<void> {
  const [referral] = await db
    .select()
    .from(affiliateReferrals)
    .where(eq(affiliateReferrals.id, referralId));

  if (!referral || referral.status !== "pending") return;

  const programSettings = await storage.getMarketingProgramSettings();

  const referredAt = referral.referredAt ? new Date(referral.referredAt) : null;
  if (!referredAt) return;

  const monthsSinceReferral = (Date.now() - referredAt.getTime()) / (1000 * 60 * 60 * 24 * 30);

  if (monthsSinceReferral >= programSettings.minRetentionMonths) {
    await storage.updateAffiliateReferral(referralId, {
      status: "active",
      activatedAt: new Date(),
    });
  }
}
