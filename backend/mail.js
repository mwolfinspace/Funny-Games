// Lightweight SMTP mailer for the Minigames backend.
// Zero dependencies: speaks plain SMTP + STARTTLS/AUTH LOGIN over net/tls.
// If SMTP is not configured (SMTP_HOST unset) it falls back to writing
// rendered .eml files into the outbox folder so password-reset etc. still
// work visibly during local testing.

"use strict";

const net = require("net");
const tls = require("tls");
const fs = require("fs");
const path = require("path");

const CFG = {
  host: process.env.SMTP_HOST || "",
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false") === "true", // 465 = TLS from start
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  from: process.env.SMTP_FROM || "Minigames <noreply@xedryk.top>",
};

// ── HTML template ───────────────────────────────────────────────────────────
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderEmail({ heading, summary, lines, cta, ctaUrl, footer }) {
  const bodyLines = (lines || [])
    .map((l) => `<p style="margin:0 0 14px;line-height:1.6;color:#444;">${esc(l)}</p>`)
    .join("");
  const ctaHtml = cta && ctaUrl
    ? `<a href="${esc(ctaUrl)}" style="display:inline-block;background:#4f7cff;color:#fff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:12px;margin-top:18px;">${esc(cta)}</a>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#eef2f7;font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(30,41,59,.08);">
        <tr><td style="background:linear-gradient(135deg,#4f7cff,#7c5cff);padding:26px 32px;">
          <div style="color:#fff;font-size:20px;font-weight:700;">🎮 Minigames Hub</div>
        </td></tr>
        <tr><td style="padding:30px 32px;">
          <h1 style="margin:0 0 6px;font-size:22px;color:#1e293b;">${esc(heading)}</h1>
          <div style="width:44px;height:4px;background:#4f7cff;border-radius:2px;margin:0 0 18px;"></div>
          <p style="margin:0 0 14px;line-height:1.6;color:#444;">${esc(summary)}</p>
          ${bodyLines}
          ${cta ? `<div style="padding:16px 20px;background:#f6f8fc;border:1px dashed #c7d2fe;border-radius:12px;font-family:Consolas,Menlo,monospace;font-size:20px;font-weight:700;letter-spacing:4px;color:#3b5bdb;text-align:center;margin:6px 0 10px;">${esc(cta)}</div>` : ""}
          ${ctaHtml}
          <p style="margin:22px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">${esc(footer || "If you didn't request this, you can safely ignore this email.")}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function writeOutbox(to, subject, html) {
  const dataDir = process.env.MG_DATA_DIR || path.join(__dirname, "..", "backend-data");
  const dir = path.join(dataDir, "outbox");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.eml`);
  const raw = [
    `To: ${to}`,
    `From: ${CFG.from}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="utf-8"',
    "",
    html,
  ].join("\r\n");
  fs.writeFileSync(file, raw, "utf8");
  return file;
}

/** Public send — resolves {ok, file?}, never rejects. */
async function sendMail({ to, subject, heading, summary, lines, cta, ctaUrl, footer }) {
  const html = renderEmail({ heading, summary, lines, cta, ctaUrl, footer });
  if (!CFG.host) {
    const file = writeOutbox(to, subject, html);
    console.log(`[mail] (no SMTP_HOST) wrote ${file}`);
    return { ok: true, file };
  }
  try {
    await smtpSend(CFG, to, subject, html);
    return { ok: true };
  } catch (err) {
    console.error("[mail] SMTP failed:", err.message);
    const file = writeOutbox(to, subject, html); // never lose the email
    return { ok: false, file, error: err.message };
  }
}

function extractAddr(header) {
  const m = String(header).match(/<([^>]+)>/);
  return m ? m[1] : String(header).trim();
}

// ── Minimal SMTP client ─────────────────────────────────────────────────────
function connectRaw(host, port, useTls) {
  return new Promise((resolve, reject) => {
    const s = useTls
      ? tls.connect({ port, host, rejectUnauthorized: false, servername: host })
      : net.connect({ port, host });
    const onErr = (e) => {
      s.destroy();
      reject(e);
    };
    s.once("error", onErr);
    if (useTls) {
      s.once("secureConnect", () => {
        s.removeListener("error", onErr);
        resolve(s);
      });
    } else {
      s.once("connect", () => {
        s.removeListener("error", onErr);
        resolve(s);
      });
    }
  });
}

async function smtpSend(cfg, to, subject, html) {
  const useTlsStart = cfg.secure && cfg.port === 465;
  let socket = await connectRaw(cfg.host, cfg.port, useTlsStart);
  let buffer = "";

  const reply = (wantCodes) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SMTP reply timeout")), 20000);
      const onData = (chunk) => {
        buffer += chunk.toString();
        let i;
        while ((i = buffer.indexOf("\r\n")) >= 0) {
          const line = buffer.slice(0, i);
          buffer = buffer.slice(i + 2);
          if (line.length >= 3 && /^\d{3}/.test(line)) {
            const code = parseInt(line.slice(0, 3), 10);
            const last = line.length === 3 || line[3] === " ";
            if (last) {
              clearTimeout(timer);
              socket.removeListener("data", onData);
              if (wantCodes.includes(code)) resolve(code);
              else reject(new Error(`SMTP ${code} ${line}`));
            }
          }
        }
      };
      socket.on("data", onData);
    });

  const send = (line) => socket.write((line || "") + "\r\n");
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

  try {
    await reply([220]); // greeting

    send("EHLO minigames-backend");
    await reply([250]);

    // Opportunistic STARTTLS (587 / insecure 25)
    if (cfg.port !== 465) {
      send("STARTTLS");
      try {
        await reply([220]);
        const tlsSock = tls.connect({
          socket,
          rejectUnauthorized: false,
          servername: cfg.host,
        });
        await new Promise((res, rej) => {
          tlsSock.once("secureConnect", res);
          tlsSock.once("error", rej);
        });
        socket = tlsSock;
        buffer = "";
        if (socket.destroy) socket.on("error", () => {}); // swallowed after upgrade
        send("EHLO minigames-backend");
        await reply([250]);
      } catch (e) {
        // server does not support STARTTLS — continue on the plain socket
      }
    }

    if (cfg.user && cfg.pass) {
      send("AUTH LOGIN");
      await reply([334]);
      send(b64(cfg.user));
      await reply([334]);
      send(b64(cfg.pass));
      await reply([235]);
    }

    send(`MAIL FROM:<${extractAddr(cfg.from)}>`);
    await reply([250]);
    send(`RCPT TO:<${extractAddr(to)}>`);
    await reply([250, 251]);
    send("DATA");
    await reply([354]);
    socket.write(
      [
        `From: ${cfg.from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        'Content-Type: text/html; charset="utf-8"',
        "",
        html,
        ".",
      ].join("\r\n") + "\r\n",
    );
    await reply([250]);
    send("QUIT");
    socket.destroy();
  } catch (e) {
    socket.destroy();
    throw e;
  }
}

module.exports = { sendMail, renderEmail, writeOutbox, extractAddr };