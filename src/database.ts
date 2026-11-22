import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "bulksend.db");

class DB {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        message       TEXT    NOT NULL,
        total         INTEGER NOT NULL DEFAULT 0,
        sent          INTEGER NOT NULL DEFAULT 0,
        failed        INTEGER NOT NULL DEFAULT 0,
        status        TEXT    NOT NULL DEFAULT 'running',  -- running | completed | stopped
        delay_min     INTEGER NOT NULL DEFAULT 3000,
        delay_max     INTEGER NOT NULL DEFAULT 7000,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
        completed_at  TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id   INTEGER NOT NULL,
        phone         TEXT    NOT NULL,
        name          TEXT    DEFAULT '',
        class         TEXT    DEFAULT '',
        student_id    TEXT    DEFAULT '',
        fee_item      TEXT    DEFAULT '',
        total_due     TEXT    DEFAULT '',
        payment_last_date TEXT DEFAULT '',
        status        TEXT    NOT NULL DEFAULT 'pending',  -- pending | sent | failed
        error         TEXT,
        sent_at       TEXT,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_campaign ON messages(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at);
    `);

    // Migration: add columns for existing databases
    this.migrate();
  }

  private migrate() {
    const cols = (this.db.pragma('table_info(messages)') as any[]).map((c: any) => c.name);
    const newCols: [string, string][] = [
      ['class', "TEXT DEFAULT ''"],
      ['student_id', "TEXT DEFAULT ''"],
      ['fee_item', "TEXT DEFAULT ''"],
      ['total_due', "TEXT DEFAULT ''"],
      ['payment_last_date', "TEXT DEFAULT ''"],
    ];
    for (const [name, def] of newCols) {
      if (!cols.includes(name)) {
        this.db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${def}`);
      }
    }
  }

  // ── Campaigns ──

  createCampaign(message: string, total: number, delayMin: number, delayMax: number): number {
    const stmt = this.db.prepare(
      `INSERT INTO campaigns (message, total, delay_min, delay_max) VALUES (?, ?, ?, ?)`
    );
    const result = stmt.run(message, total, delayMin, delayMax);
    return result.lastInsertRowid as number;
  }

  updateCampaignCounters(id: number, sent: number, failed: number) {
    this.db.prepare(
      `UPDATE campaigns SET sent = ?, failed = ? WHERE id = ?`
    ).run(sent, failed, id);
  }

  completeCampaign(id: number, status: "completed" | "stopped") {
    this.db.prepare(
      `UPDATE campaigns SET status = ?, completed_at = datetime('now','localtime') WHERE id = ?`
    ).run(status, id);
  }

  getCampaigns(limit = 50, offset = 0) {
    return this.db.prepare(
      `SELECT * FROM campaigns ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset);
  }

  getCampaign(id: number) {
    return this.db.prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id);
  }

  deleteCampaign(id: number) {
    this.db.prepare(`DELETE FROM campaigns WHERE id = ?`).run(id);
  }

  getCampaignStats() {
    return this.db.prepare(`
      SELECT
        COUNT(*) as total_campaigns,
        COALESCE(SUM(sent), 0) as total_sent,
        COALESCE(SUM(failed), 0) as total_failed,
        COALESCE(SUM(total), 0) as total_messages
      FROM campaigns
    `).get();
  }

  // ── Messages ──

  insertMessagesBatch(campaignId: number, contacts: { phone: string; name?: string; class?: string; student_id?: string; fee_item?: string; total_due?: string; payment_last_date?: string }[]) {
    const stmt = this.db.prepare(
      `INSERT INTO messages (campaign_id, phone, name, class, student_id, fee_item, total_due, payment_last_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertMany = this.db.transaction((items: typeof contacts) => {
      for (const c of items) {
        stmt.run(campaignId, c.phone, c.name || "", c.class || "", c.student_id || "", c.fee_item || "", c.total_due || "", c.payment_last_date || "");
      }
    });
    insertMany(contacts);
  }

  updateMessage(campaignId: number, phone: string, status: "sent" | "failed", error?: string) {
    this.db.prepare(
      `UPDATE messages SET status = ?, error = ?, sent_at = datetime('now','localtime')
       WHERE campaign_id = ? AND phone = ? AND status = 'pending' LIMIT 1`
    ).run(status, error || null, campaignId, phone);
  }

  getMessages(campaignId: number) {
    return this.db.prepare(
      `SELECT * FROM messages WHERE campaign_id = ? ORDER BY id`
    ).all(campaignId);
  }

  resetDatabase() {
    this.db.exec('DELETE FROM messages');
    this.db.exec('DELETE FROM campaigns');
    try { this.db.exec("DELETE FROM sqlite_sequence WHERE name IN ('campaigns', 'messages')"); } catch {}
  }
}

export const db = new DB();
