import { Client, LocalAuth } from "whatsapp-web.js";
import { Server as SocketIOServer } from "socket.io";
import * as QRCode from "qrcode";
import { db } from "./database";

export interface MessageResult {
  phone: string;
  status: "sent" | "failed";
  error?: string;
  timestamp: Date;
}

export interface BulkSendOptions {
  contacts: {
    phone: string;
    name?: string;
    class?: string;
    student_id?: string;
    fee_item?: string;
    total_due?: string;
    payment_last_date?: string;
  }[];
  message: string;
  delayMin: number;
  delayMax: number;
}

class WhatsAppManager {
  private client: Client | null = null;
  private io: SocketIOServer | null = null;
  private isReady = false;
  private isSending = false;
  private shouldStop = false;
  private connectedAt: Date | null = null;

  init(io: SocketIOServer) {
    this.io = io;
  }

  getStatus() {
    return {
      isReady: this.isReady,
      isSending: this.isSending,
    };
  }

  private removeStaleLocks() {
    try {
      const fs = require("fs");
      const path = require("path");
      const sessionDir = path.join(process.cwd(), ".wwebjs_auth", "session");
      if (fs.existsSync(sessionDir)) {
        for (const lockFile of ["SingletonLock", "SingletonSocket", "SingletonCookie", "DevToolsActivePort"]) {
          const target = path.join(sessionDir, lockFile);
          if (fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink?.()) {
            try {
              fs.unlinkSync(target);
            } catch {}
          }
        }
      }
    } catch {}
  }

  async connect(): Promise<void> {
    if (this.client) {
      await this.disconnect();
    }

    this.removeStaleLocks();

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
      authTimeoutMs: 0,
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      },
    });

    this.client.on("qr", async (qr: string) => {
      console.log("QR code received");
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300 });
        this.io?.emit("qr", qrDataUrl);
      } catch (err) {
        console.error("QR generation error:", err);
      }
    });

    this.client.on("ready", () => {
      console.log("WhatsApp client is ready!");
      this.isReady = true;
      this.connectedAt = new Date();
      this.io?.emit("ready", { message: "WhatsApp is connected!" });
    });

    this.client.on("authenticated", () => {
      console.log("WhatsApp client authenticated");
      this.io?.emit("authenticated");
    });

    this.client.on("auth_failure", (msg: string) => {
      console.error("Authentication failure:", msg);
      this.isReady = false;
      this.connectedAt = null;
      this.io?.emit("auth_failure", { message: msg });
    });

    this.client.on("disconnected", (reason: string) => {
      console.log("WhatsApp client disconnected:", reason);
      this.isReady = false;
      this.connectedAt = null;
      this.io?.emit("disconnected", { reason });
    });

    try {
      await this.client.initialize();
    } catch (err: any) {
      const errMsg = err?.message || (typeof err === "string" ? err : "Auth timeout or connection error");
      console.error("WhatsApp initialization error:", errMsg);
      this.isReady = false;
      this.connectedAt = null;
      this.io?.emit("auth_failure", { message: errMsg });
      await this.disconnect();
    }
  }

  async disconnect(): Promise<void> {
    this.shouldStop = true;
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (e) {
        // ignore
      }
      this.client = null;
      this.isReady = false;
      this.connectedAt = null;
    }
  }

  stopSending() {
    this.shouldStop = true;
  }

  private formatPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, "");
    cleaned = cleaned.replace(/^0+/, "");
    return `${cleaned}@c.us`;
  }

  private personalizeMessage(template: string, contact: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/gi, (_, key) => {
      const val = contact[key.toLowerCase()];
      return val != null ? String(val) : "";
    });
  }

  private delay(min: number, max: number): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async sendBulk(options: BulkSendOptions): Promise<MessageResult[]> {
    if (!this.client || !this.isReady) {
      throw new Error("WhatsApp is not connected");
    }

    if (this.isSending) {
      throw new Error("A bulk send is already in progress");
    }

    this.isSending = true;
    this.shouldStop = false;
    const results: MessageResult[] = [];
    const total = options.contacts.length;

    // Create campaign in DB
    const campaignId = db.createCampaign(
      options.message,
      total,
      options.delayMin,
      options.delayMax
    );
    db.insertMessagesBatch(campaignId, options.contacts);

    this.io?.emit("bulk_start", { total, campaignId });

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < total; i++) {
      if (this.shouldStop) {
        db.completeCampaign(campaignId, "stopped");
        this.io?.emit("bulk_stopped", {
          sent: i,
          total,
          campaignId,
          message: "Sending stopped by user",
        });
        break;
      }

      const contact = options.contacts[i];
      const chatId = this.formatPhone(contact.phone);
      const personalizedMsg = this.personalizeMessage(
        options.message,
        contact
      );

      try {
        await this.client.sendMessage(chatId, personalizedMsg);
        sentCount++;
        const result: MessageResult = {
          phone: contact.phone,
          status: "sent",
          timestamp: new Date(),
        };
        results.push(result);

        // Update DB
        db.updateMessage(campaignId, contact.phone, "sent");
        db.updateCampaignCounters(campaignId, sentCount, failedCount);

        this.io?.emit("message_sent", {
          index: i + 1,
          total,
          phone: contact.phone,
          name: contact.name,
          status: "sent",
          campaignId,
        });
      } catch (error: any) {
        failedCount++;
        const errMsg = error.message || "Unknown error";
        const result: MessageResult = {
          phone: contact.phone,
          status: "failed",
          error: errMsg,
          timestamp: new Date(),
        };
        results.push(result);

        // Update DB
        db.updateMessage(campaignId, contact.phone, "failed", errMsg);
        db.updateCampaignCounters(campaignId, sentCount, failedCount);

        this.io?.emit("message_sent", {
          index: i + 1,
          total,
          phone: contact.phone,
          name: contact.name,
          status: "failed",
          error: errMsg,
          campaignId,
        });
      }

      // Delay between messages
      if (i < total - 1 && !this.shouldStop) {
        this.io?.emit("delay", {
          index: i + 1,
          delayMin: options.delayMin,
          delayMax: options.delayMax,
        });
        await this.delay(options.delayMin, options.delayMax);
      }
    }

    if (!this.shouldStop) {
      db.completeCampaign(campaignId, "completed");
    }

    this.isSending = false;
    this.io?.emit("bulk_complete", {
      total: results.length,
      sent: results.filter((r) => r.status === "sent").length,
      failed: results.filter((r) => r.status === "failed").length,
      campaignId,
    });

    return results;
  }

  getDeviceInfo() {
    let clientInfo = null;
    if (this.client && this.isReady) {
      try {
        const info = (this.client as any).info;
        if (info) {
          clientInfo = {
            pushname: info.pushname || '',
            platform: info.platform || '',
            phone: info.wid?._serialized?.split('@')[0] || info.wid?.user || '',
          };
        }
      } catch {}
    }
    return {
      isReady: this.isReady,
      isSending: this.isSending,
      connectedAt: this.connectedAt?.toISOString() || null,
      clientInfo,
    };
  }

  async clearAuth(): Promise<void> {
    await this.disconnect();
    const fs = require('fs');
    const authPath = require('path').join(process.cwd(), '.wwebjs_auth');
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
    }
  }
}

export const whatsappManager = new WhatsAppManager();
