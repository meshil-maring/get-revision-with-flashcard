import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Attachment, AttachmentKind, CardSide } from './types';

type AttachmentRow = {
  id: string;
  card_id: string;
  side: string;
  kind: string;
  uri: string;
  name: string;
  mime_type: string | null;
  created_at: string;
};

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    cardId: row.card_id,
    side: row.side === 'front' ? 'front' : 'back',
    kind: row.kind as AttachmentKind,
    uri: row.uri,
    name: row.name,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

/** Attachments of the given cards, grouped by card id, oldest first. */
export async function listAttachmentsForCards(
  db: SQLiteDatabase,
  cardIds: string[],
): Promise<Map<string, Attachment[]>> {
  const byCard = new Map<string, Attachment[]>();
  if (cardIds.length === 0) return byCard;
  const placeholders = cardIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<AttachmentRow>(
    `SELECT * FROM attachments
      WHERE card_id IN (${placeholders}) AND deleted_at IS NULL
      ORDER BY created_at ASC`,
    ...cardIds,
  );
  for (const row of rows) {
    const attachment = toAttachment(row);
    const list = byCard.get(attachment.cardId) ?? [];
    list.push(attachment);
    byCard.set(attachment.cardId, list);
  }
  return byCard;
}

export async function addAttachment(
  db: SQLiteDatabase,
  cardId: string,
  input: { side: CardSide; kind: AttachmentKind; uri: string; name: string; mimeType?: string | null },
): Promise<string> {
  const id = randomUUID();
  await db.runAsync(
    `INSERT INTO attachments (id, card_id, side, kind, uri, name, mime_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    cardId,
    input.side,
    input.kind,
    input.uri,
    input.name,
    input.mimeType ?? null,
    new Date().toISOString(),
  );
  return id;
}

export async function deleteAttachment(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE attachments SET deleted_at = ? WHERE id = ?', new Date().toISOString(), id);
}
