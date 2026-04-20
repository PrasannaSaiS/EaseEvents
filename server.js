/**
 * @fileoverview EaseEvents — Real-time Crowd Intelligence Backend v3.
 * Production-hardened Express server with modular architecture.
 */

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { Logging } = require("@google-cloud/logging");
const path = require("path");
const crypto = require("crypto");

const { ZONES } = require("./config/zones");
const { processCommand } = require("./lib/engine");

// ─── Express App ────────────────────────────────────────────────────────────

const app = express();

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            fontSrc: ["'self'"],
        }
    },
    crossOriginEmbedderPolicy: false,
}));

// Compression
app.use(compression());

// CORS — configurable origin
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : "*";
app.use(cors({ origin: ALLOWED_ORIGINS }));

// JSON body parsing (built-in Express, no body-parser needed)
app.use(express.json({ limit: "10kb" }));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Request ID middleware — audit trail
app.use((req, _res, next) => {
    req.requestId = crypto.randomUUID();
    next();
});

// Request timeout middleware (30s)
app.use((req, res, next) => {
    req.setTimeout(30000);
    res.setTimeout(30000);
    next();
});

// Rate limiter for command endpoint
const commandLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
});

// ─── Google Sheets Auth ─────────────────────────────────────────────────────

let sheets = null;
try {
    const raw = process.env.GOOGLE_CREDENTIALS || "null";
    const credentials = JSON.parse(raw);
    if (!credentials) throw new Error("GOOGLE_CREDENTIALS env var not set");
    if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheets = google.sheets({ version: "v4", auth });
    console.log("Google Sheets auth OK");
} catch (err) {
    console.warn("Google Sheets auth skipped:", err.message);
    sheets = null;
}

const SPREADSHEET_ID =
    process.env.SPREADSHEET_ID || "1mwr8L384mevt6B6zTCrsXUVafOMbYTqGupSQMEVd2uw";

// ─── Google Cloud Logging ───────────────────────────────────────────────────

let gcLogging = null;
try {
    const raw = process.env.GOOGLE_CREDENTIALS || "null";
    const credentials = JSON.parse(raw);
    if (credentials && credentials.project_id) {
        gcLogging = new Logging({ credentials });
        console.log("Google Cloud Logging OK");
    }
} catch (err) {
    console.warn("Google Cloud Logging skipped:", err.message);
}

/**
 * Writes a structured log entry to Google Cloud Logging.
 * @param {string} severity - Log severity (INFO, WARNING, ERROR)
 * @param {string} message - Log message
 * @param {Object} [data={}] - Additional structured data
 */
async function cloudLog(severity, message, data = {}) {
    if (!gcLogging) return;
    try {
        const log = gcLogging.log("easeevents-backend");
        const metadata = {
            resource: { type: "global" },
            severity,
        };
        const entry = log.entry(metadata, { message, ...data });
        await log.write(entry);
    } catch (e) {
        console.warn("GCP Logging error:", e.message);
    }
}

// ─── Sheet Operations ───────────────────────────────────────────────────────

/**
 * Updates the zone-specific row in the venue_status sheet.
 * @param {Object} decision - Routing decision object
 * @param {string} range - Google Sheets cell range
 */
async function updateSheet(decision, range) {
    if (!sheets) {
        console.warn("Skipping sheet update — Sheets client not initialized.");
        return;
    }
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range,
        valueInputOption: "RAW",
        resource: {
            values: [[
                decision.crowd,
                decision.waitTime,
                decision.route,
                decision.alert,
                decision.userZone,
                decision.destination,
                new Date().toLocaleTimeString(),
            ]],
        },
    });
    console.log("Sheet updated:", range);
}

/**
 * Appends a command log entry to the command_logs sheet.
 * Also sends structured log to Google Cloud Logging.
 */
async function logCommand(command, intent, decision, confidence, reasoning) {
    await cloudLog("INFO", "Command processed", {
        command,
        source: intent.sourceZone ? intent.sourceZone.name : null,
        crowd: decision.crowd,
        route: decision.route,
        confidence,
    });

    if (!sheets) return;

    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "command_logs!A:G",
        valueInputOption: "RAW",
        resource: {
            values: [[
                new Date().toLocaleString(),
                command,
                intent.sourceZone ? intent.sourceZone.name : "Unknown",
                decision.crowd,
                decision.route,
                confidence,
                reasoning,
            ]],
        },
    });
}

/**
 * Appends an alert entry to the alerts_feed sheet.
 */
async function updateAlerts(decision) {
    if (!sheets) return;

    let priority = "Low";
    if (decision.crowd === "High") priority = "High";
    else if (decision.crowd === "Medium") priority = "Medium";

    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "alerts_feed!A:D",
        valueInputOption: "RAW",
        resource: {
            values: [[
                decision.alert,
                priority,
                decision.userZone,
                new Date().toLocaleTimeString(),
            ]],
        },
    });
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/** Health check endpoint — follows GCP health check patterns */
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        sheetsConnected: sheets !== null,
        loggingConnected: gcLogging !== null,
    });
});

/** Detailed service status */
app.get("/status", (_req, res) => {
    res.set("Cache-Control", "public, max-age=10");
    res.json({
        service: "EaseEvents Backend",
        version: "3.0.0",
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        sheetsConnected: sheets !== null,
        zones: ZONES.map(z => z.name),
    });
});

/** Core command processing endpoint */
app.post("/process-command", commandLimiter, async (req, res, next) => {
    const { command } = req.body || {};

    // Input validation & sanitization
    if (!command || typeof command !== "string" || !command.trim()) {
        return res.status(400).json({ error: "Missing or invalid 'command' field." });
    }

    if (command.length > 500) {
        return res.status(400).json({ error: "Command exceeds maximum length of 500 characters." });
    }

    const sanitizedCommand = command.trim();
    console.log(`[${req.requestId}] Incoming command:`, sanitizedCommand);

    try {
        const { intent, decision, confidence, reasoning } = await processCommand(sanitizedCommand);

        const result = {
            crowd: decision.crowd,
            waitTime: decision.waitTime,
            route: decision.route,
            alert: decision.alert,
            confidence,
            reasoning,
        };

        console.log(`[${req.requestId}] Result:`, JSON.stringify(result));

        // Write to sheets in parallel for efficiency
        const range = intent.sourceZone
            ? intent.sourceZone.range
            : "venue_status!B2:H2";

        await Promise.allSettled([
            updateSheet(decision, range),
            logCommand(sanitizedCommand, intent, decision, confidence, reasoning),
            decision.alert ? updateAlerts(decision) : Promise.resolve(),
        ]);

        res.json({ success: true, result });
    } catch (error) {
        next(error);
    }
});

// ─── Centralized Error Handler ──────────────────────────────────────────────

app.use((err, req, res, _next) => {
    const requestId = req.requestId || "unknown";
    console.error(`[${requestId}] Error:`, err.message);
    cloudLog("ERROR", err.message, { requestId, stack: err.stack });
    res.status(500).json({ error: "Internal server error. Please try again later." });
});

// ─── Server Startup & Graceful Shutdown ─────────────────────────────────────

if (require.main === module) {
    const PORT = process.env.PORT || 8080;
    const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`EaseEvents backend v3.0.0 running on port ${PORT}`);
    });

    /** Graceful shutdown on SIGTERM (Cloud Run sends this) */
    process.on("SIGTERM", () => {
        console.log("SIGTERM received — shutting down gracefully...");
        server.close(() => {
            console.log("Server closed.");
            process.exit(0);
        });
    });
}

module.exports = app;
