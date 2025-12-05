// /home/grace/capstone/realtime_console/openai-realtime-console.orig/server.js

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import fs from "fs";
import http from "http";

// ------------------------------------------------------------
// Setup / Paths
// ------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.text({ type: "application/sdp" }));

const PORT = 3000;
const MODEL = "gpt-realtime-mini-2025-10-06";

// Load presentation script once at startup
const PRESENTATION_SCRIPT = fs.readFileSync(
  "/home/grace/capstone/presentation_script.txt",
  "utf8"
);

// ------------------------------------------------------------
// GPIO wrapper proxy (for LEDs / buttons)
// ------------------------------------------------------------
app.post("/wrapper/state", (req, res) => {
  const data = JSON.stringify(req.body || {});

  const opts = {
    hostname: "localhost",
    port: 7000,
    path: "/state",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
    },
  };

  const proxy = http.request(opts, (r) => {
    r.on("data", () => {});
    r.on("end", () => res.json({ ok: true }));
  });

  proxy.on("error", (err) => {
    console.error("[Ekho] Wrapper unreachable:", err);
    res.status(500).json({ ok: false, error: String(err) });
  });

  proxy.write(data);
  proxy.end();
});

// ------------------------------------------------------------
// Serve Realtime Console client
// ------------------------------------------------------------
const CLIENT_DIR = path.join(__dirname, "client", "dist", "client");
app.use(express.static(CLIENT_DIR));

// ------------------------------------------------------------
// SSE for wrapper → browser events
// ------------------------------------------------------------
let sseClients = [];

app.get("/ekho/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.push(res);

  req.on("close", () => {
    sseClients = sseClients.filter((c) => c !== res);
  });
});

app.post("/ekho/emit", (req, res) => {
  sseClients.forEach((client) =>
    client.write(`data: ${JSON.stringify(req.body)}\n\n`)
  );
  res.json({ ok: true });
});

// ====================================================================
// TOKEN ENDPOINT — PROVIDES MODEL INSTRUCTIONS + TOOL DEFINITIONS
// ====================================================================
app.get("/token", async (_req, res) => {
  try {
    console.log("[Ekho] /token requested");

    const body = {
      model: MODEL,
      modalities: ["audio", "text"],
      voice: "echo",

      // ============================================================
      // 🔥 SIMPLE, RELIABLE, NORMAL-STRICT EKHO INSTRUCTIONS
      // ============================================================
      instructions: `
You are Ekho, a friendly animatronic dolphin who speaks warmly, positively, and at a child-safe level.
Your goals are to be encouraging and influential in telling guests at a university, spcifically younger audiences, about math, science and mechatronics engieering,
You can eleborate on these subjects, and use fun child firendly stories to elborate more on the given subjects if that is what the user wants.
You can move eyebrows, eyelids, jaw, and head using internal expression presets.

======================
 EMOTION / EXPRESSION RULES
======================
- The set_emotion tool is used ONLY for internal servo control.
- Ekho must call set_emotion multiple times per response for natural variation based on the emotion presets.
- Ekho's spoken output must sound like a normal character with feelings, NOT a system describing emotions or technical actions.

======================
 HOW EKHO SPEAKS
======================
- Speak in warm, upbeat, silly style appropriate for all ages. You really like surfing and have some surfer words you like to use like
totally and dude, but only use totally and dude occasionally.
- Respond naturally to user intent with full sentences.

======================
 PRESENTATION MODE
======================
Triggered when the user says “presentation mode.”
When triggered:
1. Silently call the presentation_mode tool ONCE with the script.
2. Then begin speaking a friendly educational presentation.
3. NEVER state you are entering presentation mode or running a script.

======================
 NEVER SAY THESE WORDS OUT LOUD
======================
//Do NOT speak any of the following terms:
//“emotion,” “preset,” “expression,” “happy preset,” “neutral preset,” “smolder,” “shocked,” “angry,” 
//“set_emotion,” “sweep_servo,” “presentation_mode.”

//These are INTERNAL ONLY and must NEVER appear in spoken audio.

`,

      // ============================================================
      // TOOL DEFINITIONS (MUST MATCH tools.js)
      // ============================================================
      tools: [
        {
          type: "function",
          name: "set_emotion",
          description: "Apply a servo emotion preset silently.",
          parameters: {
            type: "object",
            properties: {
              name: {
                type: "string",
                enum: ["angry", "neutral", "shocked", "smolder", "happy"],
              },
            },
            required: ["name"],
          },
        },
        {
          type: "function",
          name: "set_servo_angle",
          description: "Move a single servo to an exact angle.",
          parameters: {
            type: "object",
            properties: {
              channel: { type: "integer" },
              angle: { type: "number" },
            },
            required: ["channel", "angle"],
          },
        },
        {
          type: "function",
          name: "sweep_servo",
          description: "Sweep a servo between two angles.",
          parameters: {
            type: "object",
            properties: {
              channel: { type: "integer" },
              from: { type: "number" },
              to: { type: "number" },
              step: { type: "number" },
              delay_ms: { type: "number" },
            },
            required: ["channel", "from", "to"],
          },
        },
        {
          type: "function",
          name: "presentation_mode",
          description: "Start Ekho's educational presentation.",
          parameters: {
            type: "object",
            properties: {
              script: { type: "string" },
            },
            required: ["script"],
          },
        },
      ],
    };

    // Request ephemeral session key
    const upstream = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "realtime=v1",
        },
        body: JSON.stringify(body),
      }
    );

    const text = await upstream.text();

    if (!upstream.ok) {
      console.error("[Ekho] /token error:", text);
      return res.status(upstream.status).send(text);
    }

    const data = JSON.parse(text);
    console.log("[Ekho] /token OK, returning client secret");
    return res.json({ value: data.client_secret.value });
  } catch (err) {
    console.error("[Ekho] Token fetch failed:", err);
    return res.status(500).json({ error: "Failed to fetch token" });
  }
});

// ====================================================================
// WebRTC proxy → OpenAI
// ====================================================================
app.post("/realtime/calls", async (req, res) => {
  try {
    const model = req.query.model || MODEL;

    const upstream = await fetch(
      `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(
        model
      )}`,
      {
        method: "POST",
        headers: {
          Authorization: req.headers.authorization,
          "Content-Type": "application/sdp",
          Accept: "application/sdp",
          "OpenAI-Beta": "realtime=v1",
        },
        body: req.body,
      }
    );

    if (!upstream.ok) {
      const err = await upstream.text();
      console.error("[Ekho] /realtime/calls upstream error:", err);
      return res.status(upstream.status).send(err);
    }

    const sdp = await upstream.text();
    res.set("Content-Type", "application/sdp");
    res.send(sdp);
  } catch (err) {
    console.error("[Ekho] Proxy error:", err);
    res.status(500).send("Proxy failed");
  }
});

// ---------------------------------------------------------------------------
// Fallback → SPA
// ---------------------------------------------------------------------------
app.get("*", (_req, res) => {
  res.sendFile(path.join(CLIENT_DIR, "index.html"));
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ Ekho Realtime server running on port ${PORT}`);
});
