import crypto from 'crypto';
import { execute, query, queryOne } from '../database.js';
import { Claim, ClaimStatus, Item, User } from '../models/types.js';
import { getItemById, mapRowToItem, updateItemStatus } from './itemService.js';
import { createNotification } from './notificationService.js';
import { logAudit } from './auditService.js';
import { MatchResult } from '../matching/index.js';

export interface EnrichedClaim extends Claim {
  item: Item;
  claimant: {
    id: string;
    name: string;
    email?: string;
    phone?: string | null;
  };
  owner: {
    id: string;
    name: string;
    email?: string;
    phone?: string | null;
  };
  match_score?: MatchResult | null;
  finder_verification_detail?: string | null;
  risk?: {
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    total_claims: number;
    prior_rejections: number;
  };
}

// Risk thresholds: prior rejections are the strongest signal; recent claim volume is a secondary signal.
const RISK_HIGH_PRIOR_REJECTIONS = 2;
const RISK_MEDIUM_PRIOR_REJECTIONS = 1;
const RISK_MEDIUM_RECENT_CLAIMS = 5;
const RISK_LOOKBACK_DAYS = 30;

async function itemVerificationDetailPresent(itemId: string): Promise<boolean> {
  const row = await queryOne<{ verification_detail: string | null }>(
    `SELECT verification_detail FROM items WHERE id = ?`,
    [itemId]
  );
  return Boolean(row?.verification_detail?.trim());
}

export async function createClaim(
  itemId: string,
  claimantId: string,
  message: string,
  verificationAnswer: string
): Promise<Claim> {
  const item = await getItemById(itemId);
  if (!item) {
    throw new Error('Item not found');
  }

  if (item.status === 'RESOLVED') {
    throw new Error('This item has already been marked as resolved.');
  }

  if (item.owner_id === claimantId) {
    throw new Error('You cannot submit a claim on an item you reported yourself.');
  }

  // Check if a pending or approved claim already exists from this claimant
  const existing = await queryOne<Claim>(
    `SELECT * FROM claims WHERE item_id = ? AND claimant_id = ? AND status != 'REJECTED'`,
    [itemId, claimantId]
  );
  if (existing) {
    throw new Error('You already have an active or approved claim for this item.');
  }

  if (item.type === 'FOUND' && !(await itemVerificationDetailPresent(itemId))) {
    throw new Error('This found item is missing its private verification detail. Please ask a moderator to review the listing.');
  }

  const id = 'claim_' + crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO claims (
      id, item_id, claimant_id, message, verification_answer,
      status, created_at
    ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
    [id, itemId, claimantId, message.trim(), verificationAnswer.trim(), now]
  );

  await logAudit('CLAIM_SUBMITTED', claimantId, `Claim ${id} on item ${itemId}`);

  // Notify item owner that a claim was filed
  await createNotification(
    item.owner_id,
    'Claim Submitted',
    `A user has submitted an ownership claim for your ${item.type.toLowerCase()} item "${item.title}". It is awaiting moderator review.`,
    `/claims`
  );

  return {
    id,
    item_id: itemId,
    claimant_id: claimantId,
    message: message.trim(),
    verification_answer: verificationAnswer.trim(),
    status: 'PENDING',
    created_at: now,
  };
}

export async function getClaimById(id: string): Promise<Claim | null> {
  return queryOne<Claim>(`SELECT * FROM claims WHERE id = ?`, [id]);
}

export async function listUserClaims(userId: string): Promise<EnrichedClaim[]> {
  const claims = await query<Claim>(
    `SELECT * FROM claims WHERE claimant_id = ? ORDER BY created_at DESC`,
    [userId]
  );

  const results: EnrichedClaim[] = [];
  for (const c of claims) {
    const item = await getItemById(c.item_id);
    if (!item) continue;

    const claimant = await queryOne<User>(`SELECT * FROM users WHERE id = ?`, [c.claimant_id]);
    const owner = await queryOne<User>(`SELECT * FROM users WHERE id = ?`, [item.owner_id]);

    const isApproved = c.status === 'APPROVED';

    results.push({
      ...c,
      item,
      claimant: {
        id: claimant?.id || c.claimant_id,
        name: claimant?.name || 'Claimant',
        email: isApproved ? claimant?.email : undefined,
        phone: isApproved ? claimant?.phone : undefined,
      },
      owner: {
        id: owner?.id || item.owner_id,
        name: owner?.name || 'Item Reporter',
        email: isApproved ? owner?.email : undefined,
        phone: isApproved ? owner?.phone : undefined,
      },
    });
  }

  return results;
}

export async function listClaimsForModerator(
  statusFilter?: ClaimStatus,
  limit = 100,
  offset = 0
): Promise<EnrichedClaim[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);
  const recentCutoff = new Date(Date.now() - RISK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const where = statusFilter ? `WHERE c.status = ?` : '';
  const params: Array<string | number> = [recentCutoff];
  if (statusFilter) params.push(statusFilter);
  params.push(safeLimit, safeOffset);

  const rows = await query<
    Claim & {
      item_ref_id: string;
      item_type: string;
      item_title: string;
      item_description: string;
      item_category: string;
      item_location: string;
      item_latitude: number | null;
      item_longitude: number | null;
      item_event_time: string;
      item_image_url: string | null;
      item_image_embedding: string | null;
      item_verification_detail: string | null;
      item_verification_hint: string | null;
      item_owner_id: string;
      item_status: string;
      item_created_at: string;
      item_updated_at: string;
      claimant_name: string | null;
      claimant_email: string | null;
      claimant_phone: string | null;
      owner_name: string | null;
      owner_email: string | null;
      owner_phone: string | null;
      total_claims: number | string;
      prior_rejections: number | string;
      recent_claims_30d: number | string;
    }
  >(
    `SELECT
       c.*,
       i.id AS item_ref_id, i.type AS item_type, i.title AS item_title, i.description AS item_description,
       i.category AS item_category, i.location AS item_location, i.latitude AS item_latitude, i.longitude AS item_longitude,
       i.event_time AS item_event_time, i.image_url AS item_image_url, i.image_embedding AS item_image_embedding,
       i.verification_detail AS item_verification_detail, i.verification_hint AS item_verification_hint,
       i.owner_id AS item_owner_id, i.status AS item_status, i.created_at AS item_created_at, i.updated_at AS item_updated_at,
       claimant.name AS claimant_name, claimant.email AS claimant_email, claimant.phone AS claimant_phone,
       owner.name AS owner_name, owner.email AS owner_email, owner.phone AS owner_phone,
       (SELECT COUNT(*) FROM claims h WHERE h.claimant_id = c.claimant_id) AS total_claims,
       (SELECT COUNT(*) FROM claims h WHERE h.claimant_id = c.claimant_id AND h.id <> c.id AND h.status = 'REJECTED') AS prior_rejections,
       (SELECT COUNT(*) FROM claims h WHERE h.claimant_id = c.claimant_id AND h.created_at >= ?) AS recent_claims_30d
     FROM claims c
     INNER JOIN items i ON i.id = c.item_id
     LEFT JOIN users claimant ON claimant.id = c.claimant_id
     LEFT JOIN users owner ON owner.id = i.owner_id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    params
  );

  return rows.map((row) => {
    const item = mapRowToItem({
      id: row.item_ref_id,
      type: row.item_type,
      title: row.item_title,
      description: row.item_description,
      category: row.item_category,
      location: row.item_location,
      latitude: row.item_latitude,
      longitude: row.item_longitude,
      event_time: row.item_event_time,
      image_url: row.item_image_url,
      image_embedding: row.item_image_embedding,
      verification_detail: row.item_verification_detail,
      verification_hint: row.item_verification_hint as Item['verification_hint'],
      owner_id: row.item_owner_id,
      status: row.item_status,
      created_at: row.item_created_at,
      updated_at: row.item_updated_at,
    });

    const totalClaims = Number(row.total_claims || 0);
    const priorRejections = Number(row.prior_rejections || 0);
    const recentClaims = Number(row.recent_claims_30d || 0);
    const riskLevel = priorRejections >= RISK_HIGH_PRIOR_REJECTIONS
      ? 'HIGH'
      : priorRejections >= RISK_MEDIUM_PRIOR_REJECTIONS || recentClaims >= RISK_MEDIUM_RECENT_CLAIMS
      ? 'MEDIUM'
      : 'LOW';

    return {
      id: row.id,
      item_id: row.item_id,
      claimant_id: row.claimant_id,
      message: row.message,
      verification_answer: row.verification_answer,
      handover_code: row.handover_code,
      claimant_confirmed_at: row.claimant_confirmed_at,
      finder_confirmed_at: row.finder_confirmed_at,
      status: row.status,
      moderator_id: row.moderator_id,
      moderator_note: row.moderator_note,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at,
      item,
      claimant: {
        id: row.claimant_id,
        name: row.claimant_name || 'Claimant',
        email: row.claimant_email || undefined,
        phone: row.claimant_phone,
      },
      owner: {
        id: row.item_owner_id,
        name: row.owner_name || 'Owner',
        email: row.owner_email || undefined,
        phone: row.owner_phone,
      },
      finder_verification_detail: row.item_verification_detail || null,
      risk: {
        level: riskLevel,
        total_claims: totalClaims,
        prior_rejections: priorRejections,
      },
    } as EnrichedClaim;
  });
}

export async function approveClaim(
  claimId: string,
  moderatorId: string,
  moderatorNote?: string
): Promise<Claim> {
  const claim = await getClaimById(claimId);
  if (!claim) {
    throw new Error('Claim not found');
  }

  if (claim.claimant_id === moderatorId) {
    throw new Error('SELF_APPROVAL_PROHIBITED: Claimants are strictly prohibited from approving their own claims.');
  }

  if (claim.status !== 'PENDING') {
    throw new Error(`Cannot approve claim that is already ${claim.status}`);
  }

  const item = await getItemById(claim.item_id);
  if (!item) {
    throw new Error('Item not found');
  }

  const handoverCode = String(crypto.randomInt(100000, 1000000));
  const now = new Date().toISOString();
  let approvalRows = 0;
  try {
    approvalRows = await execute(
    `UPDATE claims
     SET status = 'APPROVED', moderator_id = ?, moderator_note = ?, reviewed_at = ?, handover_code = ?, claimant_confirmed_at = NULL, finder_confirmed_at = NULL
     WHERE id = ?
       AND status = 'PENDING'
       AND NOT EXISTS (
         SELECT 1 FROM claims
         WHERE item_id = ? AND status = 'APPROVED'
       )`,
      [moderatorId, moderatorNote || null, now, handoverCode, claimId, claim.item_id]
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    if (message.includes('unique') || message.includes('constraint')) {
      throw new Error('Another claim for this item is already approved.');
    }
    throw err;
  }

  if (approvalRows !== 1) {
    throw new Error('Another claim for this item is already approved.');
  }

  await updateItemStatus(claim.item_id, 'MATCHED');
  await logAudit(
    'CLAIM_APPROVED',
    moderatorId,
    `Claim ${claimId} on item ${claim.item_id}`,
    moderatorNote
  );

  await createNotification(
    claim.claimant_id,
    'Claim Approved — Handover Code',
    `Your claim for "${item.title}" was approved. Your 6-digit handover code is ${handoverCode}. Show it to the finder when you meet and confirm receipt on the item page.`,
    `/items/${item.id}`
  );

  await createNotification(
    item.owner_id,
    'Claim Approved — Handover Required',
    `A claim for "${item.title}" was approved. Ask the claimant for the 6-digit handover code when you meet, then enter it on the item page to confirm the exchange.`,
    `/items/${item.id}`
  );

  return {
    ...claim,
    status: 'APPROVED',
    moderator_id: moderatorId,
    moderator_note: moderatorNote || null,
    reviewed_at: now,
    handover_code: handoverCode,
    claimant_confirmed_at: null,
    finder_confirmed_at: null,
  };
}

export async function confirmHandover(
  claimId: string,
  userId: string,
  providedCode?: string
): Promise<Claim> {
  const claim = await getClaimById(claimId);
  if (!claim) throw new Error('Claim not found');
  if (claim.status !== 'APPROVED') throw new Error('Handover confirmation is only available for approved claims.');
  if (!claim.handover_code) throw new Error('Handover code is unavailable. Please ask a moderator to review this claim.');

  const item = await getItemById(claim.item_id);
  if (!item) throw new Error('Item not found');

  const isClaimant = claim.claimant_id === userId;
  const isFinder = item.owner_id === userId;
  if (!isClaimant && !isFinder) {
    throw new Error('Only the claimant and finder can confirm this handover.');
  }

  if (claim.claimant_confirmed_at && claim.finder_confirmed_at) {
    return claim;
  }
  if (item.status === 'RESOLVED') {
    return claim;
  }

  if (isFinder) {
    const supplied = providedCode?.trim() || '';
    const stored = claim.handover_code.trim();
    if (!/^\d{6}$/.test(supplied)) {
      throw new Error('A valid 6-digit handover code is required from the finder.');
    }
    const sameLength = supplied.length === stored.length;
    const codeMatches = sameLength && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(stored));
    if (!codeMatches) throw new Error('Incorrect handover code. Ask the claimant for the exact 6-digit code issued after approval.');
  }

  const now = new Date().toISOString();
  if (isClaimant && !claim.claimant_confirmed_at) {
    await execute(`UPDATE claims SET claimant_confirmed_at = ? WHERE id = ?`, [now, claimId]);
  }
  if (isFinder && !claim.finder_confirmed_at) {
    await execute(`UPDATE claims SET finder_confirmed_at = ? WHERE id = ?`, [now, claimId]);
  }

  const updated = await getClaimById(claimId);
  if (!updated) throw new Error('Claim not found after confirmation.');

  // Atomically close the item once both independent confirmations are present.
  // Only the call that changes MATCHED -> RESOLVED may write completion side effects.
  const resolutionRows = await execute(
    `UPDATE items SET status = 'RESOLVED', updated_at = ?
     WHERE id = ?
       AND status <> 'RESOLVED'
       AND EXISTS (
         SELECT 1 FROM claims
         WHERE id = ? AND claimant_confirmed_at IS NOT NULL AND finder_confirmed_at IS NOT NULL
       )`,
    [now, item.id, claimId]
  );

  if (resolutionRows === 1) {
    await logAudit(
      'HANDOVER_COMPLETED',
      userId,
      `Claim ${claimId} on item ${item.id}`,
      'Claimant and finder both confirmed the handover code.'
    );

    await createNotification(
      claim.claimant_id,
      'Item Return Completed',
      `The return of "${item.title}" is complete. Both parties confirmed the handover code.`,
      `/items/${item.id}`
    );
    if (item.owner_id !== claim.claimant_id) {
      await createNotification(
        item.owner_id,
        'Item Return Completed',
        `The return of "${item.title}" is complete. Both parties confirmed the handover code.`,
        `/items/${item.id}`
      );
    }
  }

  return updated;
}

export async function rejectClaim(
  claimId: string,
  moderatorId: string,
  moderatorNote: string
): Promise<Claim> {
  const claim = await getClaimById(claimId);
  if (!claim) {
    throw new Error('Claim not found');
  }

  if (claim.status !== 'PENDING') {
    throw new Error(`Cannot reject claim that is already ${claim.status}`);
  }

  const now = new Date().toISOString();
  await execute(
    `UPDATE claims SET status = 'REJECTED', moderator_id = ?, moderator_note = ?, reviewed_at = ? WHERE id = ?`,
    [moderatorId, moderatorNote, now, claimId]
  );

  const item = await getItemById(claim.item_id);

  // Record audit log
  await logAudit('CLAIM_REJECTED', moderatorId, `Claim ${claimId} on item ${claim.item_id}`, moderatorNote);

  // Notify Claimant
  await createNotification(
    claim.claimant_id,
    'Claim Rejected',
    `Your claim for "${item?.title || 'item'}" was reviewed and declined. Reason: ${moderatorNote}`,
    `/claims`
  );

  return {
    ...claim,
    status: 'REJECTED',
    moderator_id: moderatorId,
    moderator_note: moderatorNote,
    reviewed_at: now,
  };
}
