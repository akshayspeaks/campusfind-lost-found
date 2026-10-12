import crypto from 'crypto';
import { IS_PRODUCTION, VERIFICATION_DETAIL_AUDIT_SECRET } from '../config.js';
import { execute, query, queryOne } from '../database.js';
import { Item, ItemCategory, ItemStatus, ItemType, User, VerificationHint } from '../models/types.js';
import { logAudit } from './auditService.js';

export interface ItemRow {
  id: string;
  type: string;
  title: string;
  description: string;
  category: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  event_time: string;
  image_url: string | null;
  image_embedding: string | null;
  verification_detail: string | null;
  verification_hint: VerificationHint | null;
  owner_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export function mapRowToItem(row: ItemRow): Item {
  let embedding: number[] | null = null;
  if (row.image_embedding) {
    try {
      embedding = JSON.parse(row.image_embedding);
    } catch {
      embedding = null;
    }
  }

  return {
    id: row.id,
    type: row.type as ItemType,
    title: row.title,
    description: row.description,
    category: row.category as ItemCategory,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    event_time: row.event_time,
    image_url: row.image_url,
    image_embedding: embedding,
    owner_id: row.owner_id,
    status: row.status as ItemStatus,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface CreateItemDTO {
  type: ItemType;
  title: string;
  description: string;
  category: ItemCategory;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  event_time: string;
  image_url?: string | null;
  image_embedding?: number[] | null;
  verification_detail?: string | null;
  verification_hint?: VerificationHint | null;
  owner_id: string;
}

export async function createItem(dto: CreateItemDTO): Promise<Item> {
  const id = 'item_' + crypto.randomUUID();
  const now = new Date().toISOString();
  const embeddingJson = dto.image_embedding ? JSON.stringify(dto.image_embedding) : null;

  await execute(
    `INSERT INTO items (
      id, type, title, description, category, location, latitude, longitude,
      event_time, image_url, image_embedding, verification_detail, verification_hint, owner_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    [
      id,
      dto.type,
      dto.title.trim(),
      dto.description.trim(),
      dto.category,
      dto.location.trim(),
      dto.latitude ?? null,
      dto.longitude ?? null,
      dto.event_time,
      dto.image_url || null,
      embeddingJson,
      dto.type === 'FOUND' ? (dto.verification_detail?.trim() || null) : null,
      dto.type === 'FOUND' ? (dto.verification_hint || null) : null,
      dto.owner_id,
      now,
      now,
    ]
  );

  return {
    id,
    type: dto.type,
    title: dto.title.trim(),
    description: dto.description.trim(),
    category: dto.category,
    location: dto.location.trim(),
    latitude: dto.latitude ?? null,
    longitude: dto.longitude ?? null,
    event_time: dto.event_time,
    image_url: dto.image_url || null,
    image_embedding: dto.image_embedding || null,
    verification_hint: dto.type === 'FOUND' ? (dto.verification_hint || null) : null,
    owner_id: dto.owner_id,
    status: 'OPEN',
    created_at: now,
    updated_at: now,
  };
}

export async function getItemById(id: string): Promise<Item | null> {
  const row = await queryOne<ItemRow>(`SELECT * FROM items WHERE id = ?`, [id]);
  return row ? mapRowToItem(row) : null;
}

export interface ItemDetailResponse {
  item: Item;
  owner: {
    id: string;
    name: string;
    // Private fields: only included if authorized
    email?: string;
    phone?: string | null;
    contact_info?: string | null;
  };
  is_owner: boolean;
  can_view_contact: boolean;
  handover?: {
    claim_id: string;
    code?: string;
    claimant_confirmed_at?: string | null;
    finder_confirmed_at?: string | null;
    viewer_side: 'CLAIMANT' | 'FINDER';
  } | null;
  has_verification_detail?: boolean;
}

/**
 * Returns item details with strict privacy protection.
 * Private contact info (email, phone) is ONLY exposed if:
 * 1. The viewer is the owner.
 * 2. The viewer is a MODERATOR or ADMIN.
 * 3. The viewer has an APPROVED claim on this item.
 * 4. The viewer is the item owner and looking at an approved claim.
 */
export async function getItemWithPrivacy(
  itemId: string,
  viewerId?: string,
  viewerRole?: string
): Promise<ItemDetailResponse | null> {
  const item = await getItemById(itemId);
  if (!item) return null;

  const owner = await queryOne<User>(`SELECT * FROM users WHERE id = ?`, [item.owner_id]);
  if (!owner) return null;

  const isOwner = viewerId === item.owner_id;
  const isStaff = viewerRole === 'MODERATOR' || viewerRole === 'ADMIN';

  let hasApprovedClaim = false;
  if (viewerId) {
    const claim = await queryOne<{ id: string }>(
      `SELECT id FROM claims WHERE item_id = ? AND claimant_id = ? AND status = 'APPROVED'`,
      [itemId, viewerId]
    );
    hasApprovedClaim = Boolean(claim);
  }

  const canViewContact = isOwner || isStaff || hasApprovedClaim;
  const isClaimant = hasApprovedClaim;
  const canViewVerificationMeta = isOwner || isStaff;

  let handover: ItemDetailResponse['handover'] = null;
  if (isOwner || isClaimant) {
    const handoverQuery = isClaimant
      ? `SELECT id, handover_code, claimant_confirmed_at, finder_confirmed_at, claimant_id
         FROM claims
         WHERE item_id = ? AND status = 'APPROVED' AND claimant_id = ?
         ORDER BY reviewed_at DESC LIMIT 1`
      : `SELECT id, handover_code, claimant_confirmed_at, finder_confirmed_at, claimant_id
         FROM claims
         WHERE item_id = ? AND status = 'APPROVED'
         ORDER BY reviewed_at DESC LIMIT 1`;
    const approvedHandover = await queryOne<{
      id: string;
      handover_code: string | null;
      claimant_confirmed_at: string | null;
      finder_confirmed_at: string | null;
      claimant_id: string;
    }>(handoverQuery, isClaimant ? [itemId, viewerId] : [itemId]);
    if (approvedHandover?.handover_code) {
      const viewerSide = approvedHandover.claimant_id === viewerId ? 'CLAIMANT' : 'FINDER';
      handover = {
        claim_id: approvedHandover.id,
        claimant_confirmed_at: approvedHandover.claimant_confirmed_at,
        finder_confirmed_at: approvedHandover.finder_confirmed_at,
        viewer_side: viewerSide,
        ...(viewerSide === 'CLAIMANT' ? { code: approvedHandover.handover_code } : {}),
      };
    }
  }

  return {
    item,
    owner: {
      id: owner.id,
      name: owner.name,
      ...(canViewContact
        ? {
            email: owner.email,
            phone: owner.phone,
            contact_info: owner.contact_info,
          }
        : {}),
    },
    is_owner: isOwner,
    can_view_contact: canViewContact,
    handover,
    ...(canViewVerificationMeta
      ? {
          has_verification_detail: Boolean(
            (await queryOne<{ verification_detail: string | null }>(
              `SELECT verification_detail FROM items WHERE id = ?`,
              [itemId]
            ))?.verification_detail?.trim()
          ),
        }
      : {}),
  };
}

export async function updateVerificationDetail(
  itemId: string,
  detail: string,
  actorId: string
): Promise<Item> {
  const item = await getItemById(itemId);
  if (!item) throw new Error('Item not found');
  if (item.type !== 'FOUND') throw new Error('Verification detail is only available for FOUND items.');

  const claimCount = await queryOne<{ count: number | string }>(
    `SELECT COUNT(*) AS count FROM claims WHERE item_id = ?`,
    [itemId]
  );
  const hasClaims = Number(claimCount?.count || 0) > 0;
  const currentDetail = (
    await queryOne<{ verification_detail: string | null }>(
      `SELECT verification_detail FROM items WHERE id = ?`,
      [itemId]
    )
  )?.verification_detail || '';

  if (hasClaims && currentDetail.trim()) {
    throw new Error('Verification detail cannot be changed after a claim has been submitted.');
  }

  // In production a high-entropy secret is mandatory. Development uses a
  // process-local random key when no env secret is configured; set the env var
  // to keep audit hashes stable across local restarts.
  const auditHmacSecret = VERIFICATION_DETAIL_AUDIT_SECRET ||
    (IS_PRODUCTION ? '' : crypto.randomBytes(32));
  if (!auditHmacSecret || (typeof auditHmacSecret === 'string' && auditHmacSecret.length < 32)) {
    throw new Error('VERIFICATION_DETAIL_AUDIT_SECRET must be set to at least 32 characters before updating verification details.');
  }
  const hashDetail = (value: string): string =>
    crypto.createHmac('sha256', auditHmacSecret).update(value, 'utf8').digest('hex');

  await execute(
    `UPDATE items SET verification_detail = ?, updated_at = ? WHERE id = ? AND type = 'FOUND'`,
    [detail, new Date().toISOString(), itemId]
  );
  await logAudit(
    'ITEM_VERIFICATION_DETAIL_UPDATED',
    actorId,
    `Item ${itemId} verification detail updated`,
    `old_hash=${hashDetail(currentDetail)} new_hash=${hashDetail(detail)}`
  );

  return (await getItemById(itemId)) as Item;
}

export interface ItemFilterOptions {
  type?: ItemType;
  category?: string;
  status?: ItemStatus;
  queryText?: string;
  location?: string;
  ownerId?: string;
  limit?: number;
  offset?: number;
}

export async function listItems(options: ItemFilterOptions = {}): Promise<Item[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.type) {
    conditions.push(`type = ?`);
    params.push(options.type);
  }

  if (options.category && options.category !== 'ALL') {
    conditions.push(`category = ?`);
    params.push(options.category);
  }

  if (options.status && options.status !== 'ALL' as ItemStatus) {
    conditions.push(`status = ?`);
    params.push(options.status);
  }

  if (options.ownerId) {
    conditions.push(`owner_id = ?`);
    params.push(options.ownerId);
  }

  if (options.location) {
    conditions.push(`location LIKE ?`);
    params.push(`%${options.location}%`);
  }

  if (options.queryText) {
    conditions.push(`(title LIKE ? OR description LIKE ? OR location LIKE ?)`);
    const q = `%${options.queryText}%`;
    params.push(q, q, q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  const sql = `SELECT * FROM items ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = await query<ItemRow>(sql, params);
  return rows.map(mapRowToItem);
}

export async function updateItemStatus(
  id: string,
  newStatus: ItemStatus
): Promise<Item | null> {
  const now = new Date().toISOString();
  await execute(`UPDATE items SET status = ?, updated_at = ? WHERE id = ?`, [
    newStatus,
    now,
    id,
  ]);
  return getItemById(id);
}

export async function deleteItem(id: string): Promise<boolean> {
  await execute(`DELETE FROM matches WHERE lost_item_id = ? OR found_item_id = ?`, [id, id]);
  await execute(`DELETE FROM claims WHERE item_id = ?`, [id]);
  await execute(`DELETE FROM items WHERE id = ?`, [id]);
  return true;
}
