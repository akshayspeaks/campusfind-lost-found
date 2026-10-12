/**
 * Comprehensive automated test suite for CampusFind.
 * Tests matching algorithms, unit vectors, weighted renormalization,
 * candidate filtering, authorization, claims lifecycle, privacy controls,
 * and production security guarantees.
 */

import {
  calculateCosineSimilarity,
  normalizeVector,
} from '../matching/image_similarity.js';
import { calculateTextSimilarity } from '../matching/text_similarity.js';
import { calculateCategorySimilarity } from '../matching/category_similarity.js';
import { calculateLocationSimilarity, haversineDistanceKm } from '../matching/location_similarity.js';
import { calculateTimeSimilarity } from '../matching/time_similarity.js';
import { computeWeightedScore } from '../matching/scoring.js';
import { matchItems } from '../matching/index.js';
import { Item } from '../models/types.js';
import { getItemWithPrivacy, createItem, updateVerificationDetail } from '../services/itemService.js';
import { createClaim, approveClaim, rejectClaim, listUserClaims, confirmHandover, listClaimsForModerator } from '../services/claimService.js';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  verifyToken,
  createRefreshToken,
  verifyAndRotateRefreshToken,
  revokeRefreshToken,
} from '../auth/auth.js';
import {
  checkAccountLockout,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
} from '../auth/loginSecurity.js';
import {
  validatePasswordStrength,
  isValidCoordinates,
  sanitizeString,
  isValidEmail,
} from '../utils/validators.js';
import {
  validateImageSignature,
  isPathSafe,
  generateSafeImageFilename,
} from '../utils/imageSecurity.js';
import { isOriginAllowed } from '../utils/corsValidator.js';
import http from 'http';
import { createGracefulShutdown } from '../utils/gracefulShutdown.js';
import { createHealthHandler } from '../utils/healthHandler.js';
import { formatSafeAuthErrorLog } from '../utils/safeAuthLogger.js';
import { spawnSync } from 'node:child_process';
import net from 'net';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import {
  getDb,
  query,
  queryOne,
  resetDatabase,
  isPostgresMode,
  translatePlaceholders,
  setDatabaseUrlForTesting,
  saveDb,
  initSchema,
} from '../database.js';
import {
  uploadImage,
  deleteImage,
  setS3ConfigForTesting,
  isS3Configured,
} from '../services/storageService.js';
import { extractFallbackImageEmbedding } from '../utils/imageFeatureExtractor.js';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { UPLOAD_DIR, validateProductionDatabaseUrl } from '../config.js';
import { getUserNotifications } from '../services/notificationService.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail = ''): void {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('        CampusFind Production Test Suite            ');
  console.log('====================================================\n');

  // Reset database for clean test run
  await resetDatabase();

  // ----------------------------------------------------
  // SECTION 1: Matching Unit Vector Tests
  // ----------------------------------------------------
  console.log('--- SECTION 1: Image Similarity Test Vectors ---');
  {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const simIdentical = calculateCosineSimilarity(vecA, vecB);
    assert(simIdentical === 1, 'Cosine similarity identical vectors [1,0,0] & [1,0,0] === 1.0', `Got ${simIdentical}`);

    const vecC = [0, 1, 0];
    const simOrthogonal = calculateCosineSimilarity(vecA, vecC);
    assert(simOrthogonal === 0, 'Cosine similarity orthogonal vectors [1,0,0] & [0,1,0] === 0.0', `Got ${simOrthogonal}`);

    const zeroVec = [0, 0, 0];
    const simZero = calculateCosineSimilarity(vecA, zeroVec);
    assert(simZero === 0, 'Zero vector handles division-by-zero safely without throwing or NaN', `Got ${simZero}`);

    const simNull = calculateCosineSimilarity(null, vecA);
    assert(simNull === null, 'Missing image vector returns null for dynamic renormalization');
  }

  // ----------------------------------------------------
  // SECTION 2: Text Similarity Tests
  // ----------------------------------------------------
  console.log('\n--- SECTION 2: Deterministic Text Similarity ---');
  {
    const textA = 'Black Samsung Galaxy S23 smartphone near library';
    const textB = 'Found black Samsung phone near campus library stacks';
    const simHigh = calculateTextSimilarity(textA, textB);
    assert(simHigh >= 0.50, 'Similar phone descriptions produce high similarity score', `Got ${simHigh}`);

    const textC = 'Brown leather car keys keychain with Toyota logo';
    const simLow = calculateTextSimilarity(textA, textC);
    assert(simLow < 0.15, 'Completely divergent text produces low similarity', `Got ${simLow}`);
  }

  // ----------------------------------------------------
  // SECTION 3: Category & Location & Time Tests
  // ----------------------------------------------------
  console.log('\n--- SECTION 3: Category, Location, & Time Tests ---');
  {
    assert(calculateCategorySimilarity('Electronics', 'Electronics') === 1.0, 'Same category = 1.0');
    assert(calculateCategorySimilarity('Electronics', 'Bag') === 0.0, 'Different category = 0.0');
    assert(calculateCategorySimilarity('Other', 'Electronics') === 0.3, 'Other category = 0.3');

    // Haversine distance
    const dist = haversineDistanceKm(37.4275, -122.1697, 37.4276, -122.1698);
    assert(dist < 0.05, 'Haversine distance calculates accurate short distance in km', `Got ${dist} km`);

    const locScoreClose = calculateLocationSimilarity(
      { location: 'Library Floor 2', latitude: 37.4275, longitude: -122.1697 },
      { location: 'Library Stacks', latitude: 37.4276, longitude: -122.1698 }
    );
    assert(locScoreClose >= 0.90, 'Close GPS coordinates yield location score >= 0.90', `Got ${locScoreClose}`);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600 * 1000).toISOString();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 3600 * 1000).toISOString();

    const scoreRecent = calculateTimeSimilarity(now.toISOString(), oneHourAgo);
    const scoreDistant = calculateTimeSimilarity(now.toISOString(), tenDaysAgo);

    assert(scoreRecent > 0.95, 'Events 1 hour apart score > 0.95', `Got ${scoreRecent}`);
    assert(scoreDistant < scoreRecent, 'Decay function decreases score as time difference grows', `Got ${scoreDistant}`);
  }

  // ----------------------------------------------------
  // SECTION 4: Dynamic Weight Renormalization Tests
  // ----------------------------------------------------
  console.log('\n--- SECTION 4: Dynamic Weight Renormalization ---');
  {
    // With Image: 0.40 + 0.25 + 0.15 + 0.10 + 0.10 = 1.00
    const resWithImage = computeWeightedScore({
      image_score: 1.0,
      text_score: 1.0,
      category_score: 1.0,
      location_score: 1.0,
      time_score: 1.0,
    });
    assert(Math.abs(resWithImage.total_score - 1.0) < 0.0001, 'Perfect components with image equal exactly 1.0', `Got ${resWithImage.total_score}`);

    // Without Image: weights dynamically scale to sum to 1.00
    const resWithoutImage = computeWeightedScore({
      image_score: null,
      text_score: 1.0,
      category_score: 1.0,
      location_score: 1.0,
      time_score: 1.0,
    });
    assert(Math.abs(resWithoutImage.total_score - 1.0) < 0.0001, 'Perfect components WITHOUT image re-normalize to 1.0', `Got ${resWithoutImage.total_score}`);
  }

  // ----------------------------------------------------
  // SECTION 5: End-to-End Item Matching Tests
  // ----------------------------------------------------
  console.log('\n--- SECTION 5: End-to-End Item Matching Tests ---');
  {
    const lostPhone: Item = {
      id: 'test_lost_1',
      type: 'LOST',
      title: 'Samsung Galaxy S23 Ultra Black',
      description: 'Lost my black phone near Green Library second floor',
      category: 'Electronics',
      location: 'Green Library Floor 2',
      latitude: 37.4275,
      longitude: -122.1697,
      event_time: new Date().toISOString(),
      image_embedding: normalizeVector([0.9, 0.1, 0.05, 0.0]),
      owner_id: 'usr_owner',
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const foundPhone: Item = {
      id: 'test_found_1',
      type: 'FOUND',
      title: 'Black Samsung Galaxy smartphone found',
      description: 'Found black phone at Green Library study cubicle',
      category: 'Electronics',
      location: 'Green Library',
      latitude: 37.4276,
      longitude: -122.1698,
      event_time: new Date().toISOString(),
      image_embedding: normalizeVector([0.88, 0.12, 0.03, 0.0]),
      owner_id: 'usr_finder',
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const matchCaseA = matchItems(lostPhone, foundPhone);
    assert(matchCaseA.total_score >= 0.80, `Case A: High match score >= 0.80 for matching items (got ${matchCaseA.total_score})`);
    assert(
      matchCaseA.confidence_tier === 'VERY_LIKELY' || matchCaseA.confidence_tier === 'LIKELY',
      `Case A: Categorized with high confidence tier (got ${matchCaseA.confidence_tier})`
    );

    const foundBackpack: Item = {
      id: 'test_found_2',
      type: 'FOUND',
      title: 'Blue North Face backpack',
      description: 'Found blue backpack at gym locker room',
      category: 'Bag',
      location: 'Campus Recreation Center',
      latitude: 37.4300,
      longitude: -122.1750,
      event_time: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
      image_embedding: normalizeVector([0.0, 0.0, 0.9, 0.9]),
      owner_id: 'usr_finder_2',
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const matchCaseB = matchItems(lostPhone, foundBackpack);
    assert(matchCaseB.total_score < 0.35, `Case B: Different items produce low similarity < 0.35 (got ${matchCaseB.total_score})`);
    assert(matchCaseB.confidence_tier === 'LOW', 'Case B: Categorized as LOW confidence');
  }

  // ----------------------------------------------------
  // SECTION 6: Production Security & Hardening Tests
  // ----------------------------------------------------
  console.log('\n--- SECTION 6: Production Security & RBAC Enforcement ---');
  {
    // 1. Password Strength Validation
    const weak1 = validatePasswordStrength('short');
    assert(!weak1.valid, 'Password < 8 characters rejected');

    const weak2 = validatePasswordStrength('alllowercase123!');
    assert(!weak2.valid, 'Password missing uppercase rejected');

    const weak3 = validatePasswordStrength('ALLUPPERCASE123!');
    assert(!weak3.valid, 'Password missing lowercase rejected');

    const weak4 = validatePasswordStrength('NoSpecialChar123');
    assert(!weak4.valid, 'Password missing special character rejected');

    const strong = validatePasswordStrength('CampusFind#2026Secure!');
    assert(strong.valid, 'Strong password meeting all requirements accepted');

    // 2. Account Lockout Protection
    const testEmail = 'lockout_test@campus.edu';
    clearFailedLoginAttempts(testEmail);
    assert(!checkAccountLockout(testEmail).isLocked, 'Initial state: account not locked');

    for (let i = 0; i < 4; i++) {
      recordFailedLoginAttempt(testEmail);
    }
    assert(!checkAccountLockout(testEmail).isLocked, 'Account not locked after 4 failed attempts');

    const fifthAttempt = recordFailedLoginAttempt(testEmail);
    assert(fifthAttempt.isLocked, 'Account locks out immediately on 5th failed attempt');
    assert(checkAccountLockout(testEmail).isLocked, 'Subsequent checks confirm lockout');
    clearFailedLoginAttempts(testEmail);
    assert(!checkAccountLockout(testEmail).isLocked, 'Clear lockout successfully unlocks account');

    // 3. Refresh Token Generation, Rotation, and Revocation
    const userId = 'usr_sec_test';
    const rawRefreshToken = await createRefreshToken(userId);
    assert(typeof rawRefreshToken === 'string' && rawRefreshToken.length >= 64, 'Refresh token generated with high entropy');

    // Token Rotation
    const rotateResult = await verifyAndRotateRefreshToken(rawRefreshToken);
    assert(rotateResult.valid === true, 'Refresh token verifies successfully');
    assert(rotateResult.userId === userId, 'Associated user ID matches');
    assert(typeof rotateResult.newRefreshToken === 'string', 'New rotated refresh token issued');

    // Attempting to reuse old refresh token MUST fail
    const reuseResult = await verifyAndRotateRefreshToken(rawRefreshToken);
    assert(!reuseResult.valid, 'Old refresh token was revoked upon rotation (prevents reuse attacks)');

    // Revocation
    await revokeRefreshToken(rotateResult.newRefreshToken!);
    const postRevoke = await verifyAndRotateRefreshToken(rotateResult.newRefreshToken!);
    assert(!postRevoke.valid, 'Revoked token rejected during subsequent refresh');

    // 4. File Signature (Magic Bytes) Verification
    // Fake file with .jpg extension containing executable/shell text
    const maliciousBuffer = Buffer.from('#!/bin/bash\necho "exploit"', 'utf-8');
    const sigBad = validateImageSignature(maliciousBuffer);
    assert(!sigBad.valid, 'Disguised executable/script buffer rejected despite extension');

    // Valid JPEG header
    const validJpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const sigJpg = validateImageSignature(validJpgBuffer);
    assert(sigJpg.valid && sigJpg.extension === '.jpg', 'Valid JPEG magic bytes (0xFF, 0xD8, 0xFF) accepted');

    // Valid PNG header
    const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const sigPng = validateImageSignature(validPngBuffer);
    assert(sigPng.valid && sigPng.extension === '.png', 'Valid PNG magic bytes (0x89, 0x50, 0x4E, 0x47) accepted');

    // 5. Path Traversal Prevention
    assert(!isPathSafe('/app/uploads', '../etc/passwd'), 'Path traversal with ../ rejected');
    assert(!isPathSafe('/app/uploads', 'sub/file.jpg'), 'Subdirectory escape with / rejected');
    assert(isPathSafe('/app/uploads', 'clean_image_123.jpg'), 'Safe sanitized filename accepted');

    // 6. Coordinate Validation
    assert(!isValidCoordinates(95.0, 10.0), 'Latitude > 90 rejected');
    assert(!isValidCoordinates(-10.0, 195.0), 'Longitude > 180 rejected');
    assert(isValidCoordinates(37.4275, -122.1697), 'Valid campus coordinates accepted');

    // 7. Stored XSS String Sanitization
    const maliciousInput = '<script>alert("hack")</script>Student Center';
    const cleanString = sanitizeString(maliciousInput);
    assert(!cleanString.includes('<script>'), 'HTML/script tags stripped from text fields');
    assert(cleanString === 'alert("hack")Student Center', 'Text content retained without tags');

    // 8. Finder Verification + Handover Authorization
    const db = await getDb();
    const staffFinderId = 'usr_staff_finder';
    const reviewerId = 'usr_reviewer_test';
    const claimantAId = 'usr_claimant_a';
    const claimantBId = 'usr_claimant_b';
    const outsiderId = 'usr_outsider';
    db.run(`
      INSERT OR REPLACE INTO users (id, name, email, password_hash, role, created_at) VALUES
        ('${staffFinderId}', 'Staff Finder', 'staff_finder@test.edu', 'hash', 'MODERATOR', datetime('now')),
        ('${reviewerId}', 'Reviewer', 'reviewer@test.edu', 'hash', 'ADMIN', datetime('now')),
        ('${claimantAId}', 'Claimant A', 'claimant_a@test.edu', 'hash', 'STUDENT', datetime('now')),
        ('${claimantBId}', 'Claimant B', 'claimant_b@test.edu', 'hash', 'STUDENT', datetime('now')),
        ('${outsiderId}', 'Outsider', 'outsider@test.edu', 'hash', 'STUDENT', datetime('now'));
    `);

    const testItem = await createItem({
      type: 'FOUND', title: 'Lost Calculator TI-84', description: 'Found in math building room 101', category: 'Electronics',
      location: 'Math Building', latitude: 37.42, longitude: -122.16, event_time: new Date().toISOString(),
      verification_detail: 'Three faint scratches beside the battery cover', verification_hint: 'SCRATCH', owner_id: staffFinderId,
    });

    let ownerClaimFailed = false;
    try { await createClaim(testItem.id, staffFinderId, 'This is mine', 'Answer'); } catch { ownerClaimFailed = true; }
    assert(ownerClaimFailed, 'User is prohibited from submitting a claim on their own item');

    const studentClaim = await createClaim(testItem.id, claimantAId, 'I forgot this in math hall', 'Three faint scratches beside the battery cover');
    assert(studentClaim.status === 'PENDING', 'Claimant claim filed with PENDING status');

    let selfApprovalFailed = false;
    try { await approveClaim(studentClaim.id, claimantAId, 'I self approve'); } catch { selfApprovalFailed = true; }
    assert(selfApprovalFailed, 'Claimants are strictly prohibited from self-approving their claims');

    let unapprovedConfirmFailed = false;
    try { await confirmHandover(studentClaim.id, claimantAId); } catch { unapprovedConfirmFailed = true; }
    assert(unapprovedConfirmFailed, 'Confirming a non-APPROVED claim is rejected');

    const legitApproval = await approveClaim(studentClaim.id, reviewerId, 'Verified formula scratch marks');
    assert(legitApproval.status === 'APPROVED', 'Staff reviewer successfully approves claim');
    assert(/^\d{6}$/.test(legitApproval.handover_code || ''), 'Approved claim receives a 6-digit handover code');

    const finderView = await getItemWithPrivacy(testItem.id, staffFinderId, 'MODERATOR');
    const claimantView = await getItemWithPrivacy(testItem.id, claimantAId, 'STUDENT');
    const outsiderView = await getItemWithPrivacy(testItem.id, outsiderId, 'STUDENT');
    assert(finderView?.handover?.viewer_side === 'FINDER' && !finderView?.handover?.code, 'Finder cannot see the handover code');
    assert(finderView?.has_verification_detail === true && !JSON.stringify(finderView).includes('Three faint scratches beside the battery cover'), 'Finder/staff item detail exposes only a verification-detail presence flag');
    assert(claimantView?.handover?.viewer_side === 'CLAIMANT' && claimantView?.handover?.code === legitApproval.handover_code, 'Claimant can see the handover code');
    assert(outsiderView?.handover === null, 'Non-party cannot confirm or see handover data');
    assert(!JSON.stringify(outsiderView).includes('Three faint scratches beside the battery cover'), 'Public item response JSON never contains verification_detail');

    let outsiderConfirmFailed = false;
    try { await confirmHandover(studentClaim.id, outsiderId); } catch { outsiderConfirmFailed = true; }
    assert(outsiderConfirmFailed, 'Non-party user cannot confirm a handover');

    let finderMissingCodeFailed = false;
    try { await confirmHandover(studentClaim.id, staffFinderId); } catch { finderMissingCodeFailed = true; }
    assert(finderMissingCodeFailed, 'Finder confirmation without a code is rejected');

    let finderWrongCodeFailed = false;
    try { await confirmHandover(studentClaim.id, staffFinderId, '000000'); } catch { finderWrongCodeFailed = true; }
    assert(finderWrongCodeFailed, 'Wrong handover code is rejected');

    const claimantConfirm = await confirmHandover(studentClaim.id, claimantAId);
    assert(!!claimantConfirm.claimant_confirmed_at && !claimantConfirm.finder_confirmed_at, 'Claimant confirms receipt without entering a code');
    const finderConfirm = await confirmHandover(studentClaim.id, staffFinderId, legitApproval.handover_code!);
    assert(!!finderConfirm.finder_confirmed_at && !!finderConfirm.claimant_confirmed_at, 'Finder confirmation with the correct code completes both confirmations');

    const resolvedItem = await getItemWithPrivacy(testItem.id, claimantAId, 'STUDENT');
    assert(resolvedItem?.item.status === 'RESOLVED', 'Item resolves only after both sides confirm');

    const auditTarget = `Claim ${studentClaim.id} on item ${testItem.id}`;
    const auditBeforeRepeat = await query<{ count: number | string }>(`SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'HANDOVER_COMPLETED' AND target = ?`, [auditTarget]);
    const notificationsBeforeRepeat = await query<{ count: number | string }>(`SELECT COUNT(*) AS count FROM notifications WHERE title = 'Item Return Completed' AND (user_id = ? OR user_id = ?)`, [claimantAId, staffFinderId]);
    await confirmHandover(studentClaim.id, claimantAId);
    await confirmHandover(studentClaim.id, staffFinderId, legitApproval.handover_code!);
    const auditAfterRepeat = await query<{ count: number | string }>(`SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'HANDOVER_COMPLETED' AND target = ?`, [auditTarget]);
    const notificationsAfterRepeat = await query<{ count: number | string }>(`SELECT COUNT(*) AS count FROM notifications WHERE title = 'Item Return Completed' AND (user_id = ? OR user_id = ?)`, [claimantAId, staffFinderId]);
    assert(Number(auditAfterRepeat[0]?.count || 0) === Number(auditBeforeRepeat[0]?.count || 0) && Number(notificationsAfterRepeat[0]?.count || 0) === Number(notificationsBeforeRepeat[0]?.count || 0), 'Repeat handover confirmation does not add audit rows or completion notifications');

    const claimantNotifications = await getUserNotifications(claimantAId);
    const finderNotifications = await getUserNotifications(staffFinderId);
    assert(claimantNotifications.some((n) => n.title === 'Claim Approved — Handover Code' && n.message.includes(legitApproval.handover_code!)), 'Claimant approval notification contains the 6-digit handover code');
    assert(finderNotifications.some((n) => n.title === 'Claim Approved — Handover Required' && n.message.includes('Ask the claimant for the 6-digit handover code when you meet') && !n.message.includes(legitApproval.handover_code!)), 'Finder approval notification does not reveal the code');

    const secondItem = await createItem({
      type: 'FOUND', title: 'Found Headphones', description: 'Found near the library entrance', category: 'Electronics', location: 'Library Entrance',
      latitude: 37.42, longitude: -122.16, event_time: new Date().toISOString(), verification_detail: 'Blue mark inside left ear cup', owner_id: reviewerId,
    });
    const firstClaim = await createClaim(secondItem.id, claimantAId, 'These are mine', 'Blue mark inside left ear cup');
    const secondClaim = await createClaim(secondItem.id, claimantBId, 'These are mine too', 'Blue mark inside left ear cup');
    await approveClaim(firstClaim.id, reviewerId);
    let secondApprovalFailed = false;
    try { await approveClaim(secondClaim.id, reviewerId); } catch { secondApprovalFailed = true; }
    assert(secondApprovalFailed, 'Second approval on the same item is rejected');

    await rejectClaim(secondClaim.id, reviewerId, 'Insufficient proof');
    const secondRejected = await createClaim(secondItem.id, claimantBId, 'These are mine again', 'Blue mark inside left ear cup');
    await rejectClaim(secondRejected.id, reviewerId, 'Incorrect verification');
    const highRiskProbe = await createClaim(secondItem.id, claimantBId, 'Third attempt', 'Blue mark inside left ear cup');
    const riskClaims = await listClaimsForModerator('PENDING', 100, 0);
    const highRisk = riskClaims.find((claim) => claim.id === highRiskProbe.id);
    assert(highRisk?.risk?.level === 'HIGH', 'two prior rejections should produce a HIGH risk flag');

    const legacyItem = await createItem({
      type: 'FOUND', title: 'Legacy Water Bottle', description: 'Found in the gym', category: 'Other', location: 'Gym',
      latitude: 37.42, longitude: -122.16, event_time: new Date().toISOString(), owner_id: staffFinderId,
    });
    let legacyClaimFailed = false;
    try { await createClaim(legacyItem.id, claimantBId, 'It is mine', 'The hidden detail'); } catch { legacyClaimFailed = true; }
    assert(legacyClaimFailed, 'Legacy FOUND item without verification detail is initially unclaimable');
    await updateVerificationDetail(legacyItem.id, 'Small star sticker beneath the bottle cap', staffFinderId);
    const legacyAudit = await query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE action = 'ITEM_VERIFICATION_DETAIL_UPDATED' AND target = ?`,
      [`Item ${legacyItem.id} verification detail updated`]
    );
    assert(legacyAudit.length === 1, 'Updating a legacy verification detail writes an audit log entry');
    const legacyAuditNote = await queryOne<{ note: string | null }>(
      `SELECT note FROM audit_logs WHERE action = 'ITEM_VERIFICATION_DETAIL_UPDATED' AND target = ?`,
      [`Item ${legacyItem.id} verification detail updated`]
    );
    assert(Boolean(legacyAuditNote?.note && /^old_hash=[a-f0-9]{64} new_hash=[a-f0-9]{64}$/.test(legacyAuditNote.note)), 'Verification detail audit note stores old and new hashes');
    assert(!String(legacyAuditNote?.note || '').includes('Small star sticker beneath the bottle cap'), 'Verification detail audit note never contains the plaintext detail');
    const legacyClaim = await createClaim(legacyItem.id, claimantBId, 'It is mine', 'Small star sticker beneath the bottle cap');
    assert(legacyClaim.status === 'PENDING', 'Legacy FOUND item becomes claimable after verification detail is set');
    let editAfterClaimFailed = false;
    try { await updateVerificationDetail(legacyItem.id, 'Different hidden detail', staffFinderId); } catch { editAfterClaimFailed = true; }
    assert(editAfterClaimFailed, 'Verification detail edit is blocked once a claim exists');

    const crossClaimItem = await createItem({
      type: 'FOUND', title: 'Cross Claim Test Bag', description: 'Black bag found at admin block', category: 'Bag', location: 'Admin Block',
      latitude: 37.42, longitude: -122.16, event_time: new Date().toISOString(), verification_detail: 'Red thread on inside zipper', owner_id: staffFinderId,
    });
    const claimA = await createClaim(crossClaimItem.id, claimantAId, 'My bag', 'Red thread on inside zipper');
    const claimB = await createClaim(crossClaimItem.id, claimantBId, 'My bag', 'Red thread on inside zipper');
    const approvedA = await approveClaim(claimA.id, reviewerId);
    const claimantAAfterCrossClaim = await getItemWithPrivacy(crossClaimItem.id, claimantAId, 'STUDENT');
    assert(claimantAAfterCrossClaim?.handover?.claim_id === claimA.id && claimantAAfterCrossClaim?.handover?.code === approvedA.handover_code, 'Claimant only sees their own approved claim handover data');

    const perfItemId = 'item_perf_claims';
    const perfCreatedAt = new Date().toISOString();
    db.run(`INSERT OR REPLACE INTO items (id, type, title, description, category, location, event_time, owner_id, status, created_at, updated_at, verification_detail) VALUES ('${perfItemId}', 'FOUND', 'Perf Item', 'Perf test item', 'Other', 'Perf Zone', '${perfCreatedAt}', '${staffFinderId}', 'OPEN', '${perfCreatedAt}', '${perfCreatedAt}', 'perf detail')`);
    for (let i = 0; i < 300; i++) {
      db.run(`INSERT OR REPLACE INTO claims (id, item_id, claimant_id, message, verification_answer, status, created_at) VALUES ('claim_perf_${i}', '${perfItemId}', '${claimantAId}', 'Perf claim', 'Perf answer', 'PENDING', '${perfCreatedAt}')`);
    }
    const perfStart = Date.now();
    const perfRows = await listClaimsForModerator('PENDING', 100, 0);
    const perfMs = Date.now() - perfStart;
    const perfPage2 = await listClaimsForModerator('PENDING', 100, 100);
    const perfClaim = perfRows.find((claim) => claim.claimant_id === claimantAId && claim.item_id === perfItemId);
    assert(perfClaim?.risk?.level === 'MEDIUM', 'five or more claims in 30 days should produce a MEDIUM risk flag');
    console.log(`  PERF: listClaimsForModerator(300 seeded claims) page1=${perfMs}ms page1Rows=${perfRows.length} page2Rows=${perfPage2.length}`);
    assert(perfRows.length === 100 && perfPage2.length === 100, 'Moderator claims query paginates 300 seeded claims without returning all rows');

    const concurrentApprovalItem = await createItem({
      type: 'FOUND', title: 'Concurrent Approval Test', description: 'Found during concurrency test', category: 'Electronics', location: 'Concurrency Zone',
      latitude: 37.42, longitude: -122.16, event_time: new Date().toISOString(), verification_detail: 'Green mark under battery', owner_id: staffFinderId,
    });
    const concurrentClaimA = await createClaim(concurrentApprovalItem.id, claimantAId, 'My item', 'Green mark under battery');
    const concurrentClaimB = await createClaim(concurrentApprovalItem.id, claimantBId, 'My item', 'Green mark under battery');
    const concurrentApprovalResults = await Promise.allSettled([
      approveClaim(concurrentClaimA.id, reviewerId),
      approveClaim(concurrentClaimB.id, reviewerId),
    ]);
    const concurrentApprovedRows = await query<{ id: string }>(
      `SELECT id FROM claims WHERE item_id = ? AND status = 'APPROVED'`,
      [concurrentApprovalItem.id]
    );
    assert(concurrentApprovalResults.filter((result) => result.status === 'fulfilled').length === 1 && concurrentApprovedRows.length === 1, 'Simultaneous approvals yield exactly one APPROVED claim');

    const handoverItem = await createItem({
      type: 'FOUND', title: 'Concurrent Handover Test', description: 'Found during handover concurrency test', category: 'Electronics', location: 'Handover Zone',
      latitude: 37.42, longitude: -122.16, event_time: new Date().toISOString(), verification_detail: 'Yellow sticker on underside', owner_id: staffFinderId,
    });
    const handoverClaim = await createClaim(handoverItem.id, claimantAId, 'My item', 'Yellow sticker on underside');
    await approveClaim(handoverClaim.id, reviewerId);
    const auditBeforeConcurrentHandover = await query<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'HANDOVER_COMPLETED' AND target = ?`,
      [`Claim ${handoverClaim.id} on item ${handoverItem.id}`]
    );
    const notificationsBeforeConcurrentHandover = await query<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE title = 'Item Return Completed' AND (user_id = ? OR user_id = ?)`,
      [claimantAId, staffFinderId]
    );
    const approvedHandover = await queryOne<{ handover_code: string | null }>(`SELECT handover_code FROM claims WHERE id = ?`, [handoverClaim.id]);
    await Promise.all([
      confirmHandover(handoverClaim.id, claimantAId),
      confirmHandover(handoverClaim.id, staffFinderId, approvedHandover?.handover_code || undefined),
    ]);
    const auditAfterConcurrentHandover = await query<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'HANDOVER_COMPLETED' AND target = ?`,
      [`Claim ${handoverClaim.id} on item ${handoverItem.id}`]
    );
    const notificationsAfterConcurrentHandover = await query<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE title = 'Item Return Completed' AND (user_id = ? OR user_id = ?)`,
      [claimantAId, staffFinderId]
    );
    assert(Number(auditAfterConcurrentHandover[0]?.count || 0) === Number(auditBeforeConcurrentHandover[0]?.count || 0) + 1 && Number(notificationsAfterConcurrentHandover[0]?.count || 0) === Number(notificationsBeforeConcurrentHandover[0]?.count || 0) + 2, 'Simultaneous handover confirms yield one completion audit row and two notifications');
  }

  // --- SECTION 7: Strict Production CORS & Preflight Security ---
  console.log('\n--- SECTION 7: Strict Production CORS & Preflight Security ---');
  {
    const prodOrigin = 'https://campusfind-25kt.onrender.com';
    const unconfiguredRenderOrigin = 'https://malicious-tenant.onrender.com';
    const unconfiguredCloudRunOrigin = 'https://ais-dev-unconfigured.run.app';
    const unauthorizedOrigin = 'https://evil-attacker.com';
    const localhostOrigin = 'http://localhost:3000';
    const loopbackOrigin = 'http://127.0.0.1:5173';

    // 1. Configured production frontend origin -> allowed
    const isProdAllowed = isOriginAllowed(prodOrigin, 'production', prodOrigin);
    assert(isProdAllowed === true, 'configured production frontend origin → allowed');

    // 2. Unconfigured Render origin -> rejected (never wildcard all *.onrender.com)
    const isRenderRejected = isOriginAllowed(unconfiguredRenderOrigin, 'production', prodOrigin);
    assert(isRenderRejected === false, 'unconfigured Render origin → rejected');

    // 3. Unconfigured Cloud Run origin in production -> rejected (never wildcard all *.run.app)
    const isCloudRunRejected = isOriginAllowed(unconfiguredCloudRunOrigin, 'production', prodOrigin);
    assert(isCloudRunRejected === false, 'unconfigured Cloud Run origin → rejected');

    // 4. Localhost in development -> allowed
    const isLocalhostAllowed = isOriginAllowed(localhostOrigin, 'development', prodOrigin);
    assert(isLocalhostAllowed === true, 'localhost in development → allowed (localhost:3000)');
    const isLoopbackAllowed = isOriginAllowed(loopbackOrigin, 'development', prodOrigin);
    assert(isLoopbackAllowed === true, 'localhost in development → allowed (127.0.0.1:5173)');

    // 5. Unauthorized production origin -> rejected
    const isUnauthorizedRejected = isOriginAllowed(unauthorizedOrigin, 'production', prodOrigin);
    assert(isUnauthorizedRejected === false, 'unauthorized production origin → rejected');
    const isUnauthorizedDevRejected = isOriginAllowed(unauthorizedOrigin, 'development', prodOrigin);
    assert(isUnauthorizedDevRejected === false, 'arbitrary unauthorized origin in development → rejected');

    // Comma-separated list support in production
    const multiOriginConfig = `${prodOrigin}, https://campusfind.edu, https://admin.campusfind.edu`;
    assert(
      isOriginAllowed('https://campusfind.edu', 'production', multiOriginConfig) === true,
      'comma-separated multiple configured origins supported in production'
    );
    assert(
      isOriginAllowed('https://admin.campusfind.edu', 'production', multiOriginConfig) === true,
      'comma-separated secondary domain allowed'
    );
    assert(
      isOriginAllowed('https://other.edu', 'production', multiOriginConfig) === false,
      'unlisted domain in multi-config strictly rejected'
    );

    // AI Studio / Cloud Run preview origin in development -> allowed
    assert(
      isOriginAllowed(unconfiguredCloudRunOrigin, 'development', prodOrigin) === true,
      'Cloud Run preview origin allowed in non-production development'
    );

    // 6. Integration tests with Express and CORS middleware:
    // Verify OPTIONS preflight and credentials handling
    const testApp = express();
    const testCorsOptions: cors.CorsOptions = {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin, 'production', prodOrigin)) {
          return callback(null, true);
        }
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
    };
    testApp.use(cors(testCorsOptions));
    testApp.options('*', cors(testCorsOptions));
    testApp.get('/api/test', (req, res) => res.json({ ok: true }));

    const server = testApp.listen(0);
    const testPort = (server.address() as net.AddressInfo).port;

    const reqHttp = (
      method: string,
      originHeader?: string,
      isPreflight = false
    ): Promise<{ status: number; headers: http.IncomingHttpHeaders }> => {
      return new Promise((resolve, reject) => {
        const headers: Record<string, string> = {};
        if (originHeader) headers['Origin'] = originHeader;
        if (isPreflight) {
          headers['Access-Control-Request-Method'] = 'POST';
          headers['Access-Control-Request-Headers'] = 'Authorization';
        }
        const req = http.request(
          `http://127.0.0.1:${testPort}/api/test`,
          { method, headers },
          (res) => {
            res.resume();
            res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers }));
          }
        );
        req.on('error', reject);
        req.end();
      });
    };

    // Preflight OPTIONS for allowed origin
    const preflightAllowed = await reqHttp('OPTIONS', prodOrigin, true);
    assert(
      preflightAllowed.status === 204 &&
      preflightAllowed.headers['access-control-allow-origin'] === prodOrigin,
      'OPTIONS preflight → works (returns 204 and echoes allowed origin)'
    );
    assert(
      preflightAllowed.headers['access-control-allow-credentials'] === 'true',
      'credentials remain enabled only for allowed origins (preflight)'
    );
    assert(
      preflightAllowed.headers['access-control-allow-origin'] !== '*',
      'never use Access-Control-Allow-Origin: * with credentials'
    );

    // Preflight OPTIONS for unconfigured origin (must omit allow-origin gracefully without error)
    const preflightRejected = await reqHttp('OPTIONS', unconfiguredRenderOrigin, true);
    assert(
      preflightRejected.headers['access-control-allow-origin'] === undefined,
      'OPTIONS preflight with unauthorized origin omits Access-Control-Allow-Origin gracefully'
    );
    assert(
      preflightRejected.headers['access-control-allow-credentials'] === undefined,
      'OPTIONS preflight with unauthorized origin omits credentials'
    );

    // Actual GET for allowed origin
    const getAllowed = await reqHttp('GET', prodOrigin);
    assert(
      getAllowed.status === 200 &&
      getAllowed.headers['access-control-allow-origin'] === prodOrigin &&
      getAllowed.headers['access-control-allow-credentials'] === 'true',
      'GET request with allowed origin returns 200 with credentials enabled'
    );

    // Actual GET for unauthorized origin
    const getRejected = await reqHttp('GET', unauthorizedOrigin);
    assert(
      getRejected.status === 200 &&
      getRejected.headers['access-control-allow-origin'] === undefined &&
      getRejected.headers['access-control-allow-credentials'] === undefined,
      'credentials remain enabled only for allowed origins (omitted for unauthorized origin)'
    );

    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // ----------------------------------------------------
  // SECTION 8: Production Persistence & Storage Migration
  // ----------------------------------------------------
  console.log('\n--- SECTION 8: Production Persistence & Storage Migration ---');
  {
    // 1. Parameter translation ($1, $2 instead of ?)
    const simpleSql = 'SELECT * FROM items WHERE id = ?';
    assert(
      translatePlaceholders(simpleSql) === 'SELECT * FROM items WHERE id = $1',
      'Translates single ? to $1'
    );

    const multiSql = 'UPDATE users SET name = ?, email = ? WHERE id = ?';
    assert(
      translatePlaceholders(multiSql) === 'UPDATE users SET name = $1, email = $2 WHERE id = $3',
      'Translates multiple ? parameters in order ($1, $2, $3)'
    );

    const quoteSql = "SELECT * FROM items WHERE title = 'What? Lost item?' AND id = ?";
    assert(
      translatePlaceholders(quoteSql) === "SELECT * FROM items WHERE title = 'What? Lost item?' AND id = $1",
      "Preserves '?' characters inside quoted string literals"
    );

    const escapedQuoteSql = "SELECT * FROM items WHERE desc = 'It''s fine? Yes' AND id = ? AND type = ?";
    assert(
      translatePlaceholders(escapedQuoteSql) === "SELECT * FROM items WHERE desc = 'It''s fine? Yes' AND id = $1 AND type = $2",
      "Handles escaped single quotes ('') and translates subsequent placeholders correctly"
    );

    // 2. Dual mode detection
    assert(!isPostgresMode(), 'SQLite fallback mode active by default when DATABASE_URL is not PostgreSQL');
    setDatabaseUrlForTesting('postgresql://user:secret@render-db.internal:5432/campusfind');
    assert(isPostgresMode(), 'PostgreSQL mode detected when DATABASE_URL has postgresql protocol');
    setDatabaseUrlForTesting('postgres://user:secret@render-db.internal:5432/campusfind');
    assert(isPostgresMode(), 'PostgreSQL mode detected when DATABASE_URL has postgres protocol');
    // Restore default SQLite mode
    setDatabaseUrlForTesting(null);
    assert(!isPostgresMode(), 'Reverts seamlessly to SQLite mode');

    // 3. SQLite saveDb() no-op behavior
    let saveDbThrew = false;
    try {
      saveDb();
    } catch {
      saveDbThrew = true;
    }
    assert(!saveDbThrew, 'saveDb() operates safely without errors in SQLite mode');

    // 4. Fallback image embedding directly from in-memory Buffer
    const fakeJpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      ...new Array(100).fill(128),
    ]);
    const embeddingFromBuffer = extractFallbackImageEmbedding(fakeJpegBuffer);
    assert(Array.isArray(embeddingFromBuffer), 'Image embedding extracted directly from Buffer without disk write');
    assert(embeddingFromBuffer?.length === 64, 'Image embedding has exactly 64 dimensions');
    const norm = Math.sqrt(embeddingFromBuffer!.reduce((acc, v) => acc + v * v, 0));
    assert(Math.abs(norm - 1.0) < 1e-4, 'Embedding vector is normalized unit vector (~1.0 magnitude)');
    assert(extractFallbackImageEmbedding(Buffer.alloc(0)) === null, 'Empty buffer safely returns null embedding');

    // 5. Storage service: Local Fallback
    assert(!isS3Configured(), 'Storage service identifies S3 as unconfigured during local fallback');
    const testLocalFilename = 'test_upload_fallback.jpg';
    const uploadResult = await uploadImage(fakeJpegBuffer, testLocalFilename, 'image/jpeg');
    assert(uploadResult.storageType === 'local', 'Upload defaults to local storage when S3 is unconfigured');
    assert(uploadResult.url === `/uploads/${testLocalFilename}`, 'Returns standard local /uploads URL');
    const localDiskPath = path.join(UPLOAD_DIR, testLocalFilename);
    assert(fs.existsSync(localDiskPath), 'Local file was written to disk at UPLOAD_DIR');

    // Local deletion
    const deleteResult = await deleteImage(uploadResult.url);
    assert(deleteResult === true, 'deleteImage successfully deletes local fallback file');
    assert(!fs.existsSync(localDiskPath), 'Local file was unlinked from disk');

    // 6. Storage service: S3 / Cloudflare R2 Mocked Upload & Delete Path
    let sentCommand: any = null;
    const mockS3Client = {
      send: async (command: any) => {
        sentCommand = command;
        return {};
      },
    } as unknown as S3Client;

    setS3ConfigForTesting({
      client: mockS3Client,
      bucket: 'campusfind-test-bucket',
      region: 'us-east-1',
      publicUrlPrefix: 'https://images.campusfind.edu',
    });

    try {
      assert(isS3Configured(), 'isS3Configured() returns true when client and bucket are configured');

      const s3UploadResult = await uploadImage(fakeJpegBuffer, 'test_s3_file.jpg', 'image/jpeg');
      assert(s3UploadResult.storageType === 's3', 'uploadImage routes to S3 when configured');
      assert(
        s3UploadResult.url === 'https://images.campusfind.edu/items/test_s3_file.jpg',
        'uploadImage formats public URL with configured S3_PUBLIC_URL_PREFIX'
      );
      assert(sentCommand instanceof PutObjectCommand, 'Mock S3 client processed PutObjectCommand');
      assert(sentCommand.input.Bucket === 'campusfind-test-bucket', 'S3 PutObjectCommand used configured bucket');
      assert(sentCommand.input.Key === 'items/test_s3_file.jpg', 'S3 PutObjectCommand used correct item key');
      assert(sentCommand.input.ContentType === 'image/jpeg', 'S3 PutObjectCommand specified correct content type');

      const s3DeleteResult = await deleteImage(s3UploadResult.url);
      assert(s3DeleteResult === true, 'deleteImage routes to S3 client when URL is S3 cloud URL');
      assert(sentCommand instanceof DeleteObjectCommand, 'Mock S3 client processed DeleteObjectCommand');
      assert(sentCommand.input.Key === 'items/test_s3_file.jpg', 'S3 DeleteObjectCommand extracted correct object key');
    } finally {
      setS3ConfigForTesting(null);
    }
  }

  // ----------------------------------------------------
  // SECTION 9: Duplicate Approval Startup Recovery
  // ----------------------------------------------------
  console.log('\n--- SECTION 9: Duplicate Approval Startup Recovery ---');
  {
    // The schema migration uses ROW_NUMBER() on this bundled SQLite engine.
    await resetDatabase();
    const migrationDb = await getDb();
    const windowProbe = migrationDb.exec(
      'SELECT ROW_NUMBER() OVER (ORDER BY value) AS row_number FROM (SELECT 1 AS value)'
    );
    assert(Number(windowProbe[0]?.values[0]?.[0]) === 1, 'SQL.js SQLite supports ROW_NUMBER window functions used by duplicate cleanup');

    migrationDb.run('DROP INDEX IF EXISTS idx_claims_one_approved_per_item');
    const createdAt = '2026-01-01T00:00:00.000Z';
    const userSeeds = [
      ['migration_owner', 'Migration Owner', 'migration_owner@test.edu'],
      ['migration_claimant_a', 'Migration Claimant A', 'migration_claimant_a@test.edu'],
      ['migration_claimant_b', 'Migration Claimant B', 'migration_claimant_b@test.edu'],
    ];
    for (const [id, name, email] of userSeeds) {
      migrationDb.run(
        'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, email, 'test-hash', 'STUDENT', createdAt]
      );
    }
    migrationDb.run(
      `INSERT INTO items (id, type, title, description, category, location, event_time, owner_id, status, created_at, updated_at)
       VALUES (?, 'FOUND', ?, ?, 'Other', 'Migration Zone', ?, ?, 'MATCHED', ?, ?)`,
      ['migration_duplicate_item', 'Migration item', 'Duplicate approvals test', createdAt, 'migration_owner', createdAt, createdAt]
    );

    const claimInsert = `INSERT INTO claims
      (id, item_id, claimant_id, message, verification_answer, handover_code,
       claimant_confirmed_at, finder_confirmed_at, status, moderator_note, created_at, reviewed_at)
      VALUES (?, ?, ?, 'test claim', 'test answer', ?, ?, ?, 'APPROVED', ?, ?, ?)`;
    // The fully confirmed claim is reviewed later. Its confirmation state must take precedence.
    migrationDb.run(claimInsert, [
      'claim_unconfirmed_earlier', 'migration_duplicate_item', 'migration_claimant_a',
      '111111', null, null, 'original note', createdAt, '2026-01-02T00:00:00.000Z',
    ]);
    migrationDb.run(claimInsert, [
      'claim_confirmed_preferred', 'migration_duplicate_item', 'migration_claimant_b',
      '222222', '2026-01-04T00:00:00.000Z', '2026-01-04T00:01:00.000Z', null, createdAt, '2026-01-04T00:00:00.000Z',
    ]);

    // initSchema is the actual SQLite startup initializer. It must repair rows before creating the index.
    initSchema(migrationDb);
    const approvedAfterFirstInit = migrationDb.exec(
      "SELECT id FROM claims WHERE item_id = 'migration_duplicate_item' AND status = 'APPROVED'"
    )[0]?.values || [];
    const resetAfterFirstInit = migrationDb.exec(
      "SELECT status, handover_code, claimant_confirmed_at, finder_confirmed_at, moderator_note FROM claims WHERE id = 'claim_unconfirmed_earlier'"
    )[0]?.values[0] || [];
    const resetAuditAfterFirstInit = migrationDb.exec(
      "SELECT id FROM audit_logs WHERE action = 'CLAIM_DUPLICATE_APPROVAL_RESET' AND target = 'Claim claim_unconfirmed_earlier on item migration_duplicate_item'"
    )[0]?.values || [];
    assert(approvedAfterFirstInit.length === 1 && approvedAfterFirstInit[0][0] === 'claim_confirmed_preferred', 'Duplicate cleanup keeps exactly one approved claim and prefers the fully confirmed claim');
    assert(
      resetAfterFirstInit[0] === 'PENDING' && resetAfterFirstInit[1] === null && resetAfterFirstInit[2] === null && resetAfterFirstInit[3] === null && String(resetAfterFirstInit[4]).includes('Auto-reset: duplicate approval detected during migration'),
      'Duplicate approval is reset to PENDING, handover fields are cleared, and migration note is appended'
    );
    assert(resetAuditAfterFirstInit.length === 1, 'Duplicate approval reset writes one CLAIM_DUPLICATE_APPROVAL_RESET audit row');
    const itemStatusAfterMigration = migrationDb.exec(
      "SELECT status FROM items WHERE id = 'migration_duplicate_item'"
    )[0]?.values[0]?.[0];
    assert(itemStatusAfterMigration === 'MATCHED', 'Duplicate cleanup does not change the item status for the kept claim');

    const claimsSnapshot = JSON.stringify(migrationDb.exec(
      'SELECT id, status, handover_code, claimant_confirmed_at, finder_confirmed_at, moderator_note FROM claims ORDER BY id'
    )[0]?.values || []);
    const auditsSnapshot = JSON.stringify(migrationDb.exec(
      'SELECT id, action, moderator_id, target, timestamp, note FROM audit_logs ORDER BY id'
    )[0]?.values || []);
    initSchema(migrationDb);
    const claimsAfterSecondInit = JSON.stringify(migrationDb.exec(
      'SELECT id, status, handover_code, claimant_confirmed_at, finder_confirmed_at, moderator_note FROM claims ORDER BY id'
    )[0]?.values || []);
    const auditsAfterSecondInit = JSON.stringify(migrationDb.exec(
      'SELECT id, action, moderator_id, target, timestamp, note FROM audit_logs ORDER BY id'
    )[0]?.values || []);
    assert(
      claimsAfterSecondInit === claimsSnapshot && auditsAfterSecondInit === auditsSnapshot,
      'Second startup is idempotent and changes no claim or audit rows'
    );

    await resetDatabase();
    const cleanDb = await getDb();
    initSchema(cleanDb);
    const cleanClaims = Number(cleanDb.exec('SELECT COUNT(*) FROM claims')[0]?.values[0]?.[0] || 0);
    const cleanResetAudits = Number(cleanDb.exec("SELECT COUNT(*) FROM audit_logs WHERE action = 'CLAIM_DUPLICATE_APPROVAL_RESET'")[0]?.values[0]?.[0] || 0);
    const cleanIndexes = cleanDb.exec("PRAGMA index_list('claims')")[0]?.values || [];
    const hasApprovalIndex = cleanIndexes.some((row) => row[1] === 'idx_claims_one_approved_per_item');
    assert(cleanClaims === 0 && cleanResetAudits === 0 && hasApprovalIndex, 'Clean database initialization is unaffected and still creates the partial unique index');
  }

  // ----------------------------------------------------
  // Authentication failure logs redact token/password values and avoid Error dumps.
  // ----------------------------------------------------
  console.log('\n--- Authentication Log Hygiene ---');
  {
    const tokenSecret = 'eyJhbGciOiJIUzI1NiJ9.payloadsecret.signaturesecret';
    const passwordSecret = 'DontLog-Password-Value-7391';
    const err = Object.assign(new Error(`Invalid credentials: token=${tokenSecret} password:${passwordSecret} Bearer ${tokenSecret}`), { code: 'AUTH_FAILURE' });
    const line = formatSafeAuthErrorLog('Refresh token error', err);
    assert(!line.includes(tokenSecret), 'Authentication failure log line excludes the supplied token value');
    assert(!line.includes(passwordSecret) && line.includes('[REDACTED]'), 'Authentication failure log line excludes the supplied password value');
    assert(line.includes('code: AUTH_FAILURE') && !line.includes('Error:') && !line.includes('stack'), 'Authentication failure logs contain only sanitized message and error code');
  }

  // ----------------------------------------------------
  // /health status code tracks database availability.
  // ----------------------------------------------------
  console.log('\n--- Health Handler ---');
  {
    const invokeHealth = async (checkDatabase: () => Promise<unknown>) => {
      let statusCode: number | null = null;
      let body: Record<string, unknown> | null = null;
      const response = {
        status(code: number) { statusCode = code; return this; },
        json(value: Record<string, unknown>) { body = value; return this; },
      };
      const handler = createHealthHandler({
        checkDatabase,
        version: 'test-version',
        production: false,
        uptimeSeconds: () => 42,
        now: () => new Date('2026-01-01T00:00:00.000Z'),
      });
      await handler({} as express.Request, response as unknown as express.Response);
      return { statusCode, body };
    };
    const healthy = await invokeHealth(async () => ({ result: 1 }));
    assert(healthy.statusCode === 200 && healthy.body?.database === 'healthy' && healthy.body.status === 'ok', '/health returns 200 when the database check succeeds');
    const degraded = await invokeHealth(async () => { throw new Error('test-only unreachable database'); });
    assert(degraded.statusCode === 503 && degraded.body?.database === 'degraded' && degraded.body.status === 'degraded', '/health returns 503 with the degraded JSON body when the database check fails');
  }

  // ----------------------------------------------------
  // Graceful shutdown drains an in-flight request before closing the database.
  // ----------------------------------------------------
  console.log('\n--- Graceful Shutdown ---');
  {
    let closeDatabaseCalls = 0;
    let exitCode: number | null = null;
    let logOutput = '';
    const testServer = http.createServer((_req, res) => {
      setTimeout(() => { res.statusCode = 200; res.end('slow-response-complete'); }, 100);
    });
    await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', () => resolve()));
    const address = testServer.address();
    if (!address || typeof address === 'string') throw new Error('Graceful shutdown test server did not bind to a TCP port.');
    const responsePromise = new Promise<string>((resolve, reject) => {
      const request = http.get({ host: '127.0.0.1', port: address.port, path: '/' }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => { body += chunk; });
        response.on('end', () => resolve(body));
      });
      request.on('error', reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const shutdown = createGracefulShutdown(testServer, async () => { closeDatabaseCalls++; }, {
      timeoutMs: 1000,
      exitProcess: (code) => { exitCode = code; },
      logger: { log: (message: string) => { logOutput += `${message}\n`; }, error: (message: string) => { logOutput += `${message}\n`; } },
    });
    shutdown('SIGTERM');
    const responseBody = await responsePromise;
    await new Promise<void>((resolve) => {
      const poll = () => exitCode === null ? setTimeout(poll, 5) : resolve();
      poll();
    });
    assert(responseBody === 'slow-response-complete', 'Graceful shutdown lets an in-flight request complete');
    assert(closeDatabaseCalls === 1 && logOutput.includes('Database connections closed.'), 'Graceful shutdown closes the database after HTTP requests drain');
    assert(exitCode === 0, 'Graceful shutdown exits with code 0 after successful drain');
    testServer.closeAllConnections?.();
  }

  // ----------------------------------------------------
  // Production configuration: production never silently falls back to SQLite.
  // ----------------------------------------------------
  console.log('\n--- Production Configuration Guard ---');
  {
    const missingUrl = validateProductionDatabaseUrl('production', undefined);
    const sqliteProtocol = validateProductionDatabaseUrl('production', 'sqlite:///tmp/campusfind.sqlite');
    const validUrl = validateProductionDatabaseUrl('production', 'postgresql://campusfind:example@localhost:5432/campusfind_test');
    assert(Boolean(missingUrl?.includes('DATABASE_URL')), 'Production config rejects missing DATABASE_URL with a clear message');
    assert(Boolean(sqliteProtocol?.includes('postgres:// or postgresql://')), 'Production config rejects non-PostgreSQL URLs');
    assert(validUrl === null, 'Production config accepts a valid PostgreSQL DATABASE_URL');

    const configModuleUrl = new URL('../config.ts', import.meta.url).href;
    const childSource = `import { tmpdir } from 'node:os'; process.chdir(tmpdir()); await import(${JSON.stringify(configModuleUrl)});`;
    const commonEnv = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'jwt-test-secret-'.padEnd(40, 'x'), JWT_REFRESH_SECRET: 'refresh-test-secret-'.padEnd(40, 'x'), VERIFICATION_DETAIL_AUDIT_SECRET: 'audit-test-secret-'.padEnd(40, 'x') };
    const missingEnv = { ...commonEnv };
    delete missingEnv.DATABASE_URL;
    const missingRun = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', childSource], { cwd: process.cwd(), env: missingEnv, encoding: 'utf8', timeout: 10000 });
    assert(missingRun.status === 1 && `${missingRun.stdout}${missingRun.stderr}`.includes('FATAL: DATABASE_URL must be explicitly set'), 'Production config subprocess exits 1 when DATABASE_URL is missing');
    const validRun = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', childSource], { cwd: process.cwd(), env: { ...commonEnv, DATABASE_URL: 'postgresql://campusfind:example@localhost:5432/campusfind_test' }, encoding: 'utf8', timeout: 10000 });
    assert(validRun.status === 0, 'Production config subprocess starts with a valid PostgreSQL DATABASE_URL', `${validRun.stderr || validRun.error || ''}`);
  }

  console.log('\n====================================================');
  console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test runner encountered unexpected error:', err);
  process.exit(1);
});
