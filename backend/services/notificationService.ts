import crypto from 'crypto';
import { execute, query } from '../database.js';
import { Notification } from '../models/types.js';

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  link?: string
): Promise<Notification> {
  const id = 'notif_' + crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await execute(
    `INSERT INTO notifications (id, user_id, title, message, link, read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [id, userId, title, message, link || null, createdAt]
  );

  return {
    id,
    user_id: userId,
    title,
    message,
    link: link || null,
    read: false,
    created_at: createdAt,
  };
}

export async function getUserNotifications(userId: string): Promise<Notification[]> {
  const rows = await query<{
    id: string;
    user_id: string;
    title: string;
    message: string;
    link: string | null;
    read: number;
    created_at: string;
  }>(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );

  return rows.map((r) => ({
    ...r,
    read: Boolean(r.read),
  }));
}

export async function markNotificationAsRead(id: string, userId: string): Promise<boolean> {
  await execute(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`, [id, userId]);
  return true;
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  await execute(`UPDATE notifications SET read = 1 WHERE user_id = ?`, [userId]);
}
