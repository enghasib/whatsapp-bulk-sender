// ═══════════════════════════════════════════
// WhatsApp Bulk Sender — Client
// ═══════════════════════════════════════════

(() => {
  "use strict";

  let contacts = [];
  let isConnected = false;
  let uptimeInterval = null;
  let connectedAtDate = null;
  const socket = io();

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const dom = {
    badge: $("#connection-badge"),
    badgeText: $("#badge-text"),
    btnConnect: $("#btn-connect"),
    btnDisconnect: $("#btn-disconnect"),
    qrModal: $("#qr-modal"),
    qrClose: $("#qr-close"),
    qrLoading: $("#qr-loading"),
    qrImage: $("#qr-image"),
    csvInput: $("#csv-input"),
    fileDrop: $("#file-drop"),
    manualContacts: $("#manual-contacts"),
    btnAddManual: $("#btn-add-manual"),
    contactCountBadge: $("#contact-count-badge"),
    contactsEmpty: $("#contacts-empty"),
    contactsList: $("#contacts-list"),
    btnClear: $("#btn-clear-contacts"),
    messageEditor: $("#message-editor"),
    charCount: $("#char-count"),
    delayMin: $("#delay-min"),
    delayMax: $("#delay-max"),
    btnSend: $("#btn-send"),
    btnStop: $("#btn-stop"),
    summaryCards: $("#summary-cards"),
    summarySent: $("#summary-sent"),
    summaryFailed: $("#summary-failed"),
    summaryTotal: $("#summary-total"),
    progressContainer: $("#progress-container"),
    progressFill: $("#progress-fill"),
    progressPct: $("#progress-pct"),
    progressLabel: $("#progress-label"),
    progressText: $("#progress-text"),
    logContainer: $("#log-container"),
    logEmpty: $("#log-empty"),
    log: $("#log"),
    // Views
    viewSender: $("#view-sender"),
    viewHistory: $("#view-history"),
    viewSettings: $("#view-settings"),
    // History
    historyEmpty: $("#history-empty"),
    historyList: $("#history-list"),
    btnRefresh: $("#btn-refresh-history"),
    hTotalCampaigns: $("#h-total-campaigns"),
    hTotalSent: $("#h-total-sent"),
    hTotalFailed: $("#h-total-failed"),
    hTotalMessages: $("#h-total-messages"),
    // Detail modal
    detailModal: $("#detail-modal"),
    detailBackdrop: $("#detail-backdrop"),
    detailClose: $("#detail-close"),
    detailTitle: $("#detail-title"),
    detailBody: $("#detail-body"),
    // Settings
    sStatus: $("#s-status"),
    sDevice: $("#s-device"),
    sPlatform: $("#s-platform"),
    sPhone: $("#s-phone"),
    sConnectedTime: $("#s-connected-time"),
    sUptime: $("#s-uptime"),
    btnDeleteAuth: $("#btn-delete-auth"),
    btnResetApp: $("#btn-reset-app"),
    themeToggle: $("#theme-toggle"),
    // Confirm modal
    confirmModal: $("#confirm-modal"),
    confirmBackdrop: $("#confirm-backdrop"),
    confirmClose: $("#confirm-close"),
    confirmTitle: $("#confirm-title"),
    confirmMessage: $("#confirm-message"),
    confirmCancel: $("#confirm-cancel"),
    confirmOk: $("#confirm-ok"),
  };

  // ════════════════════════
  //  THEME (DAY / NIGHT)
  // ════════════════════════
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    $$(".theme-opt").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === theme);
    });
  }

  const savedTheme = localStorage.getItem("theme") || "dark";
  setTheme(savedTheme);

  dom.themeToggle?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    setTheme(cur === "dark" ? "light" : "dark");
  });

  $$(".theme-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.theme);
    });
  });

  // ════════════════════════
  //  VIEW SWITCHING
  // ════════════════════════
  $$(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".view-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      dom.viewSender.classList.toggle("hidden", view !== "sender");
      dom.viewHistory.classList.toggle("hidden", view !== "history");
      dom.viewSettings.classList.toggle("hidden", view !== "settings");

      if (view === "history") loadHistory();
      if (view === "settings") loadSettings();
    });
  });

  // ════════════════════════
  //  TABS (CSV / Manual)
  // ════════════════════════
  $$(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".seg-btn").forEach((b) => b.classList.remove("active"));
      $$(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $(`#tab-${btn.dataset.tab}`).classList.add("active");
    });
  });

  // ════════════════════════
  //  CONFIRM DIALOG HELPER
  // ════════════════════════
  let confirmCallback = null;

  function showConfirm(title, message, onConfirm) {
    dom.confirmTitle.textContent = title;
    dom.confirmMessage.textContent = message;
    confirmCallback = onConfirm;
    dom.confirmModal.classList.remove("hidden");
  }

  function closeConfirm() {
    dom.confirmModal.classList.add("hidden");
    confirmCallback = null;
  }

  dom.confirmClose?.addEventListener("click", closeConfirm);
  dom.confirmBackdrop?.addEventListener("click", closeConfirm);
  dom.confirmCancel?.addEventListener("click", closeConfirm);
  dom.confirmOk?.addEventListener("click", () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  });

  // ════════════════════════
  //  CONNECTION
  // ════════════════════════
  function setStatus(state, text) {
    dom.badge.className = `badge badge-${state}`;
    dom.badgeText.textContent = text;
    isConnected = state === "online";
    updateSendButton();
    if (dom.sStatus) {
      dom.sStatus.textContent = text;
      dom.sStatus.style.color =
        state === "online" ? "var(--accent)" : state === "connecting" ? "var(--warning)" : "var(--text-muted)";
    }
  }

  dom.btnConnect.addEventListener("click", async () => {
    dom.btnConnect.disabled = true;
    setStatus("connecting", "Connecting");
    dom.qrModal.classList.remove("hidden");
    dom.qrLoading.classList.remove("hidden");
    dom.qrImage.classList.add("hidden");
    try {
      await fetch("/api/connect", { method: "POST" });
    } catch {
      setStatus("offline", "Failed");
      dom.btnConnect.disabled = false;
      dom.qrModal.classList.add("hidden");
    }
  });

  dom.btnDisconnect.addEventListener("click", async () => {
    await fetch("/api/disconnect", { method: "POST" });
    setStatus("offline", "Offline");
    dom.btnConnect.disabled = false;
    dom.btnConnect.classList.remove("hidden");
    dom.btnDisconnect.classList.add("hidden");
    loadSettings();
  });

  dom.qrClose.addEventListener("click", () => dom.qrModal.classList.add("hidden"));
  $(".modal-backdrop")?.addEventListener("click", () => dom.qrModal.classList.add("hidden"));

  // ════════════════════════
  //  SOCKET EVENTS
  // ════════════════════════
  socket.on("qr", (qrDataUrl) => {
    dom.qrLoading.classList.add("hidden");
    dom.qrImage.src = qrDataUrl;
    dom.qrImage.classList.remove("hidden");
    setStatus("connecting", "Scan QR");
  });

  socket.on("ready", () => {
    setStatus("online", "Connected");
    dom.qrModal.classList.add("hidden");
    dom.btnConnect.classList.add("hidden");
    dom.btnDisconnect.classList.remove("hidden");
    loadSettings();
  });

  socket.on("authenticated", () => setStatus("connecting", "Loading..."));

  socket.on("auth_failure", () => {
    setStatus("offline", "Auth Failed");
    dom.btnConnect.disabled = false;
    dom.btnConnect.classList.remove("hidden");
    dom.btnDisconnect.classList.add("hidden");
    dom.qrModal.classList.add("hidden");
  });

  socket.on("disconnected", () => {
    setStatus("offline", "Offline");
    dom.btnConnect.disabled = false;
    dom.btnConnect.classList.remove("hidden");
    dom.btnDisconnect.classList.add("hidden");
    loadSettings();
  });

  socket.on("status", (data) => {
    if (data.isReady) {
      setStatus("online", "Connected");
      dom.btnConnect.classList.add("hidden");
      dom.btnDisconnect.classList.remove("hidden");
    }
  });

  // ════════════════════════
  //  SENDING EVENTS
  // ════════════════════════
  let sentCount = 0,
    failedCount = 0;

  socket.on("bulk_start", ({ total }) => {
    sentCount = 0;
    failedCount = 0;
    dom.progressContainer.classList.remove("hidden");
    dom.summaryCards.classList.remove("hidden");
    dom.logEmpty.classList.add("hidden");
    dom.log.classList.remove("hidden");
    dom.log.innerHTML = "";
    dom.progressFill.style.width = "0%";
    dom.progressPct.textContent = "0%";
    dom.progressLabel.textContent = "Sending...";
    dom.progressText.textContent = `0 / ${total}`;
    dom.summarySent.textContent = "0";
    dom.summaryFailed.textContent = "0";
    dom.summaryTotal.textContent = "0";
    addLog("info", `Starting to send ${total} messages...`);
  });

  socket.on("message_sent", ({ index, total, phone, name, status, error }) => {
    const pct = Math.round((index / total) * 100);
    dom.progressFill.style.width = `${pct}%`;
    dom.progressPct.textContent = `${pct}%`;
    dom.progressText.textContent = `${index} / ${total}`;
    const label = name ? `${name} (${phone})` : phone;
    if (status === "sent") {
      sentCount++;
      addLog("sent", `Sent to ${label}`);
    } else {
      failedCount++;
      addLog("failed", `Failed: ${label} — ${error}`);
    }
    dom.summarySent.textContent = sentCount;
    dom.summaryFailed.textContent = failedCount;
    dom.summaryTotal.textContent = index;
  });

  socket.on("delay", () => {});

  socket.on("bulk_complete", ({ total, sent, failed }) => {
    addLog("info", `Complete — ${sent} sent, ${failed} failed out of ${total}`);
    dom.progressLabel.textContent = "Done";
    dom.summarySent.textContent = sent;
    dom.summaryFailed.textContent = failed;
    dom.summaryTotal.textContent = total;
    dom.btnSend.classList.remove("hidden");
    dom.btnStop.classList.add("hidden");
    dom.btnSend.disabled = false;
    sentCount = 0;
    failedCount = 0;
  });

  socket.on("bulk_stopped", ({ sent, total }) => {
    addLog("info", `Stopped — ${sent} / ${total} sent`);
    dom.progressLabel.textContent = "Stopped";
    dom.btnSend.classList.remove("hidden");
    dom.btnStop.classList.add("hidden");
    dom.btnSend.disabled = false;
    sentCount = 0;
    failedCount = 0;
  });

  function addLog(type, message) {
    dom.logEmpty.classList.add("hidden");
    dom.log.classList.remove("hidden");
    const icons = { sent: "✓", failed: "✕", info: "•" };
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const el = document.createElement("div");
    el.className = `log-entry ${type}`;
    el.innerHTML = `<span class="log-icon">${icons[type] || "•"}</span><span class="log-text">${esc(
      message
    )}</span><span class="log-time">${time}</span>`;
    dom.log.appendChild(el);
    dom.log.scrollTop = dom.log.scrollHeight;
  }

  // ════════════════════════
  //  CSV / FILE DROP
  // ════════════════════════
  dom.fileDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    dom.fileDrop.classList.add("dragover");
  });
  dom.fileDrop.addEventListener("dragleave", () => dom.fileDrop.classList.remove("dragover"));
  dom.fileDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    dom.fileDrop.classList.remove("dragover");
    if (e.dataTransfer.files[0]) uploadCSV(e.dataTransfer.files[0]);
  });
  dom.csvInput.addEventListener("change", () => {
    if (dom.csvInput.files[0]) uploadCSV(dom.csvInput.files[0]);
  });

  async function uploadCSV(file) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload-csv", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) data.contacts.forEach((c) => addContact(c));
      else alert("Error: " + data.message);
    } catch (err) {
      alert("Upload failed: " + err.message);
    }
  }

  // ════════════════════════
  //  MANUAL ENTRY
  // ════════════════════════
  dom.btnAddManual.addEventListener("click", () => {
    dom.manualContacts.value.trim().split("\n").forEach((line) => {
      const parts = line.split(",").map((s) => s.trim());
      if (parts[0])
        addContact({
          phone: parts[0],
          name: parts[1] || "",
          class: parts[2] || "",
          student_id: parts[3] || "",
          fee_item: parts[4] || "",
          total_due: parts[5] || "",
          payment_last_date: parts[6] || "",
        });
    });
    dom.manualContacts.value = "";
  });

  // ════════════════════════
  //  CONTACTS
  // ════════════════════════
  function addContact(c) {
    if (contacts.find((x) => x.phone === c.phone)) return;
    contacts.push(c);
    renderContacts();
  }

  function removeContact(i) {
    contacts.splice(i, 1);
    renderContacts();
  }

  function renderContacts() {
    dom.contactCountBadge.textContent = contacts.length;
    if (contacts.length === 0) {
      dom.contactsEmpty.classList.remove("hidden");
      dom.contactsList.classList.add("hidden");
      dom.btnClear.classList.add("hidden");
    } else {
      dom.contactsEmpty.classList.add("hidden");
      dom.contactsList.classList.remove("hidden");
      dom.btnClear.classList.remove("hidden");
      dom.contactsList.innerHTML = contacts
        .map((c, i) => {
          const ini = (c.name || c.phone.slice(-2)).slice(0, 2).toUpperCase();
          const sub = [c.phone, c.student_id, c.class].filter(Boolean).join(" · ");
          return `<div class="contact-item"><div class="contact-avatar">${ini}</div><div class="contact-info"><div class="contact-name">${esc(
            c.name || "Unknown"
          )}</div><div class="contact-phone">${esc(
            sub
          )}</div></div><button class="contact-remove" data-index="${i}" title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>`;
        })
        .join("");
      dom.contactsList.querySelectorAll(".contact-remove").forEach((btn) => {
        btn.addEventListener("click", () => removeContact(Number(btn.dataset.index)));
      });
    }
    updateSendButton();
  }

  dom.btnClear.addEventListener("click", () => {
    contacts = [];
    renderContacts();
  });

  // ════════════════════════
  //  RICH MESSAGE EDITOR & VARIABLE TAGS
  // ════════════════════════
  function createTagElement(varName) {
    const tag = document.createElement("span");
    tag.className = "var-tag";
    tag.setAttribute("contenteditable", "false");
    tag.setAttribute("data-var", varName);
    tag.innerHTML = `{{${esc(varName)}}}<button type="button" class="var-tag-x" title="Remove">&times;</button>`;
    return tag;
  }

  function insertVariable(varName) {
    dom.messageEditor.focus();
    const sel = window.getSelection();
    const tag = createTagElement(varName);
    const space = document.createTextNode("\u00A0");

    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (dom.messageEditor.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(space);
        range.insertNode(tag);
        range.setStartAfter(space);
        range.setEndAfter(space);
        sel.removeAllRanges();
        sel.addRange(range);
        updateCharCount();
        return;
      }
    }

    // Fallback: append at end
    dom.messageEditor.appendChild(tag);
    dom.messageEditor.appendChild(space);
    updateCharCount();
  }

  // Handle dismiss button click inside tags
  dom.messageEditor.addEventListener("click", (e) => {
    const btn = e.target.closest(".var-tag-x");
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const tag = btn.closest(".var-tag");
      if (tag) {
        tag.remove();
        updateCharCount();
      }
    }
  });

  // Handle click on variable insert buttons
  $$(".var-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      insertVariable(btn.dataset.var);
    });
  });

  // Extract raw template string from rich editor
  function getEditorTemplate() {
    let text = "";
    function traverse(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent.replace(/\u00A0/g, " ");
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList && node.classList.contains("var-tag")) {
          const varName = node.getAttribute("data-var");
          text += `{{${varName}}}`;
        } else if (node.tagName === "BR") {
          text += "\n";
        } else if (node.tagName === "DIV" || node.tagName === "P") {
          if (text.length > 0 && !text.endsWith("\n")) text += "\n";
          for (let child of node.childNodes) traverse(child);
        } else {
          for (let child of node.childNodes) traverse(child);
        }
      }
    }
    for (let child of dom.messageEditor.childNodes) traverse(child);
    return text.trim();
  }

  function updateCharCount() {
    const template = getEditorTemplate();
    dom.charCount.textContent = template.length;
  }

  dom.messageEditor.addEventListener("input", updateCharCount);

  // ════════════════════════
  //  SEND
  // ════════════════════════
  function updateSendButton() {
    dom.btnSend.disabled = !(isConnected && contacts.length > 0);
  }

  dom.btnSend.addEventListener("click", async () => {
    const message = getEditorTemplate();
    if (!message) return alert("Please enter a message.");
    const delayMin = Number(dom.delayMin.value) * 1000;
    const delayMax = Number(dom.delayMax.value) * 1000;
    dom.btnSend.classList.add("hidden");
    dom.btnStop.classList.remove("hidden");
    try {
      await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts, message, delayMin, delayMax }),
      });
    } catch (err) {
      alert("Error: " + err.message);
      dom.btnSend.classList.remove("hidden");
      dom.btnStop.classList.add("hidden");
    }
  });

  dom.btnStop.addEventListener("click", async () => {
    await fetch("/api/stop", { method: "POST" });
  });

  // ════════════════════════
  //  SETTINGS & DEVICE INFO
  // ════════════════════════
  function formatUptime(ms) {
    if (ms <= 0) return "0s";
    const sec = Math.floor((ms / 1000) % 60);
    const min = Math.floor((ms / (1000 * 60)) % 60);
    const hr = Math.floor(ms / (1000 * 60 * 60));
    const parts = [];
    if (hr > 0) parts.push(`${hr}h`);
    if (min > 0) parts.push(`${min}m`);
    parts.push(`${sec}s`);
    return parts.join(" ");
  }

  function startUptimeTicker() {
    if (uptimeInterval) clearInterval(uptimeInterval);
    if (!connectedAtDate) {
      dom.sUptime.textContent = "—";
      return;
    }
    uptimeInterval = setInterval(() => {
      const diff = Date.now() - connectedAtDate.getTime();
      dom.sUptime.textContent = formatUptime(diff);
    }, 1000);
  }

  async function loadSettings() {
    try {
      const res = await fetch("/api/device-info").then((r) => r.json());
      if (!res.success) return;

      const online = res.isReady;
      dom.sStatus.textContent = online ? "Connected" : "Offline";
      dom.sStatus.style.color = online ? "var(--accent)" : "var(--text-muted)";

      if (res.clientInfo) {
        dom.sDevice.textContent = res.clientInfo.pushname || "Linked Device";
        dom.sPlatform.textContent = res.clientInfo.platform || "WhatsApp Web";
        dom.sPhone.textContent = res.clientInfo.phone || "—";
      } else {
        dom.sDevice.textContent = online ? "Linked Device" : "—";
        dom.sPlatform.textContent = online ? "WhatsApp Web" : "—";
        dom.sPhone.textContent = "—";
      }

      if (res.connectedAt) {
        connectedAtDate = new Date(res.connectedAt);
        dom.sConnectedTime.textContent = connectedAtDate.toLocaleString();
        startUptimeTicker();
      } else {
        connectedAtDate = null;
        dom.sConnectedTime.textContent = "—";
        if (uptimeInterval) clearInterval(uptimeInterval);
        dom.sUptime.textContent = "—";
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }

  dom.btnDeleteAuth?.addEventListener("click", () => {
    showConfirm(
      "Delete Connection Data",
      "Are you sure you want to delete the saved session? You will need to scan QR code again.",
      async () => {
        try {
          await fetch("/api/delete-auth", { method: "POST" });
          setStatus("offline", "Offline");
          dom.btnConnect.disabled = false;
          dom.btnConnect.classList.remove("hidden");
          dom.btnDisconnect.classList.add("hidden");
          loadSettings();
        } catch (e) {
          alert("Error deleting auth: " + e.message);
        }
      }
    );
  });

  dom.btnResetApp?.addEventListener("click", () => {
    showConfirm(
      "Reset Entire App",
      "WARNING: This will delete all campaign history, messages, and disconnect WhatsApp. Proceed?",
      async () => {
        try {
          await fetch("/api/reset", { method: "POST" });
          contacts = [];
          renderContacts();
          dom.messageEditor.innerHTML = "";
          updateCharCount();
          setStatus("offline", "Offline");
          dom.btnConnect.disabled = false;
          dom.btnConnect.classList.remove("hidden");
          dom.btnDisconnect.classList.add("hidden");
          loadSettings();
          loadHistory();
        } catch (e) {
          alert("Error resetting app: " + e.message);
        }
      }
    );
  });

  // ════════════════════════
  //  HISTORY
  // ════════════════════════
  async function loadHistory() {
    try {
      const [campRes, statsRes] = await Promise.all([
        fetch("/api/history/campaigns").then((r) => r.json()),
        fetch("/api/history/stats").then((r) => r.json()),
      ]);

      if (statsRes.success) {
        const s = statsRes.stats;
        dom.hTotalCampaigns.textContent = s.total_campaigns;
        dom.hTotalSent.textContent = s.total_sent;
        dom.hTotalFailed.textContent = s.total_failed;
        dom.hTotalMessages.textContent = s.total_messages;
      }

      if (campRes.success && campRes.campaigns.length > 0) {
        dom.historyEmpty.classList.add("hidden");
        dom.historyList.classList.remove("hidden");
        dom.historyList.innerHTML = campRes.campaigns
          .map((c) => {
            const date = new Date(c.created_at).toLocaleString();
            const msgPreview = c.message.length > 60 ? c.message.slice(0, 60) + "…" : c.message;
            return `
            <div class="campaign-card" data-id="${c.id}">
              <div class="campaign-status-dot ${c.status}"></div>
              <div class="campaign-info">
                <div class="campaign-msg">${esc(msgPreview)}</div>
                <div class="campaign-meta">
                  <span>${date}</span>
                  <span>${c.status}</span>
                </div>
              </div>
              <div class="campaign-counts">
                <div class="campaign-count sent">
                  <span class="campaign-count-val">${c.sent}</span>
                  <span class="campaign-count-lbl">Sent</span>
                </div>
                <div class="campaign-count failed">
                  <span class="campaign-count-val">${c.failed}</span>
                  <span class="campaign-count-lbl">Failed</span>
                </div>
              </div>
              <div class="campaign-actions">
                <button class="btn-icon btn-delete-campaign" data-id="${c.id}" title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>`;
          })
          .join("");

        dom.historyList.querySelectorAll(".campaign-card").forEach((card) => {
          card.addEventListener("click", (e) => {
            if (e.target.closest(".btn-delete-campaign")) return;
            openCampaignDetail(Number(card.dataset.id));
          });
        });

        dom.historyList.querySelectorAll(".btn-delete-campaign").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            showConfirm("Delete Campaign", "Are you sure you want to delete this campaign?", async () => {
              await fetch(`/api/history/campaigns/${btn.dataset.id}`, { method: "DELETE" });
              loadHistory();
            });
          });
        });
      } else {
        dom.historyEmpty.classList.remove("hidden");
        dom.historyList.classList.add("hidden");
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }

  dom.btnRefresh.addEventListener("click", loadHistory);

  // ════════════════════════
  //  CAMPAIGN DETAIL MODAL
  // ════════════════════════
  async function openCampaignDetail(id) {
    try {
      const res = await fetch(`/api/history/campaigns/${id}`).then((r) => r.json());
      if (!res.success) return;

      const c = res.campaign;
      const msgs = res.messages;
      const date = new Date(c.created_at).toLocaleString();

      dom.detailTitle.textContent = `Campaign #${c.id}`;
      dom.detailBody.innerHTML = `
        <div class="detail-stats">
          <div class="detail-stat" style="border-color: rgba(34,197,94,0.15); background: var(--accent-glow);">
            <span class="detail-stat-val" style="color: var(--accent);">${c.sent}</span>
            <span class="detail-stat-lbl">Sent</span>
          </div>
          <div class="detail-stat" style="border-color: rgba(239,68,68,0.15); background: var(--danger-glow);">
            <span class="detail-stat-val" style="color: var(--danger);">${c.failed}</span>
            <span class="detail-stat-lbl">Failed</span>
          </div>
          <div class="detail-stat" style="border-color: rgba(59,130,246,0.15); background: var(--info-glow);">
            <span class="detail-stat-val" style="color: var(--info);">${c.total}</span>
            <span class="detail-stat-lbl">Total</span>
          </div>
        </div>

        <div>
          <span class="label">Status: <strong style="color: var(--text);">${c.status}</strong> &nbsp;·&nbsp; ${date}</span>
        </div>

        <div>
          <span class="label">Message Template</span>
          <div class="detail-message">${esc(c.message)}</div>
        </div>

        <div>
          <span class="label">Messages (${msgs.length})</span>
          <div class="detail-messages-list">
            ${msgs
              .map(
                (m) => `
              <div class="detail-msg-item">
                <div class="detail-msg-status ${m.status}"></div>
                <span class="detail-msg-phone">${esc(m.phone)}</span>
                <span class="detail-msg-name">${esc(m.name || "—")}</span>
                <span class="detail-msg-name">${esc(m.student_id || "")}</span>
                ${m.error ? `<span class="detail-msg-error" title="${esc(m.error)}">${esc(m.error)}</span>` : ""}
                <span class="detail-msg-time">${m.sent_at || "—"}</span>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `;

      dom.detailModal.classList.remove("hidden");
    } catch (err) {
      console.error("Failed to load campaign:", err);
    }
  }

  dom.detailClose.addEventListener("click", () => dom.detailModal.classList.add("hidden"));
  dom.detailBackdrop.addEventListener("click", () => dom.detailModal.classList.add("hidden"));

  // ════════════════════════
  //  HELPERS
  // ════════════════════════
  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }
})();
