import { Router, Request, Response } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { whatsappManager } from "../whatsapp";
import { db } from "../database";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── WhatsApp Connection ──

router.post("/connect", async (_req: Request, res: Response) => {
  try {
    whatsappManager.connect().catch((err) => {
      console.error("Async connect error caught:", err?.message || err);
    });
    res.json({ success: true, message: "Connecting... scan the QR code." });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/disconnect", async (_req: Request, res: Response) => {
  try {
    await whatsappManager.disconnect();
    res.json({ success: true, message: "Disconnected." });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/status", (_req: Request, res: Response) => {
  res.json(whatsappManager.getStatus());
});

// ── CSV Upload ──

router.post(
  "/upload-csv",
  upload.single("file"),
  (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded" });
      }

      const csvContent = req.file.buffer.toString("utf-8");
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const contacts = records
        .map((row: any) => ({
          phone:
            row.phone || row.Phone || row.number || row.Number || row.mobile || row.Mobile || "",
          name: row.name || row.Name || "",
          class: row.class || row.Class || row.CLASS || "",
          student_id: row.student_id || row.Student_ID || row.StudentID || row.studentId || row.StudentId || "",
          fee_item: row.fee_item || row.Fee_Item || row.FeeItem || row.fee || row.Fee || "",
          total_due: row.total_due || row.Total_Due || row.TotalDue || row.due || row.Due || row.amount || row.Amount || "",
          payment_last_date: row.payment_last_date || row.Payment_Last_Date || row.PaymentLastDate || row.last_date || row.Last_Date || row.deadline || row.Deadline || "",
        }))
        .filter((c: any) => c.phone);

      res.json({ success: true, contacts, count: contacts.length });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

// ── Send Messages ──

router.post("/send", async (req: Request, res: Response) => {
  try {
    const { contacts, message, delayMin = 3000, delayMax = 7000 } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ success: false, message: "No contacts provided" });
    }

    if (!message || typeof message !== "string" || message.trim() === "") {
      return res.status(400).json({ success: false, message: "No message provided" });
    }

    whatsappManager.sendBulk({
      contacts,
      message,
      delayMin: Math.max(1000, Number(delayMin)),
      delayMax: Math.max(2000, Number(delayMax)),
    });

    res.json({
      success: true,
      message: `Sending ${contacts.length} messages...`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/stop", (_req: Request, res: Response) => {
  whatsappManager.stopSending();
  res.json({ success: true, message: "Stop signal sent." });
});

// ── History ──

router.get("/history/campaigns", (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const campaigns = db.getCampaigns(limit, offset);
    res.json({ success: true, campaigns });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/history/campaigns/:id", (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const campaign = db.getCampaign(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }
    const messages = db.getMessages(id);
    res.json({ success: true, campaign, messages });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/history/campaigns/:id", (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    db.deleteCampaign(id);
    res.json({ success: true, message: "Campaign deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/history/stats", (_req: Request, res: Response) => {
  try {
    const stats = db.getCampaignStats();
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Device Info & Settings ──

router.get("/device-info", (_req: Request, res: Response) => {
  try {
    const info = whatsappManager.getDeviceInfo();
    res.json({ success: true, ...info });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/delete-auth", async (_req: Request, res: Response) => {
  try {
    await whatsappManager.clearAuth();
    res.json({ success: true, message: "Connection data deleted." });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/reset", async (_req: Request, res: Response) => {
  try {
    await whatsappManager.clearAuth();
    db.resetDatabase();
    res.json({ success: true, message: "App has been reset." });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
