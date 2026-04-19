require("dotenv").config();

// ============================================================
//  EaseEvents � Real-time Crowd Intelligence Backend v3
//  Smart source/destination parsing | Zone-aware routing
// ============================================================

const express = require("express");
const cors = require("cors");
const bp = require("body-parser");
const { google } = require("googleapis");

const app = express();
app.use(cors());
app.use(bp.json());

// ============================================================
//  GOOGLE SHEETS AUTH
// ============================================================
let sheets;
try {
    const raw = process.env.GOOGLE_CREDENTIALS || "null";
    const credentials = JSON.parse(raw);
    if (!credentials) throw new Error("GOOGLE_CREDENTIALS env var not set");
    if (credentials.private_key)
        credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheets = google.sheets({ version: "v4", auth });
    console.log("?  Google Sheets auth OK");
} catch (err) {
    console.warn("??  Google Sheets auth skipped:", err.message);
    sheets = null;
}

const SPREADSHEET_ID =
    process.env.SPREADSHEET_ID || "1mwr8L384mevt6B6zTCrsXUVafOMbYTqGupSQMEVd2uw";

// ============================================================
//  ZONE REGISTRY
//  Each entry: canonical name, aliases, sheet row, alternatives
// ============================================================
const ZONES = [
    {
        name: "South Gate",
        aliases: ["south gate", "south entrance", "s gate"],
        range: "venue_status!B2:H2",
        alternatives: ["North Gate", "East Gate", "West Gate"],
    },
    {
        name: "North Gate",
        aliases: ["north gate", "north entrance", "n gate"],
        range: "venue_status!B3:H3",
        alternatives: ["South Gate", "East Gate", "West Gate"],
    },
    {
        name: "Food Court A",
        aliases: ["food court a", "food court 1", "food area a"],
        range: "venue_status!B4:H4",
        alternatives: ["Food Court B"],
    },
    {
        name: "Food Court B",
        aliases: ["food court b", "food court 2", "food area b"],
        range: "venue_status!B6:H6",
        alternatives: ["Food Court A"],
    },
    {
        name: "East Gate",
        aliases: ["east gate", "east entrance", "e gate"],
        range: "venue_status!B7:H7",
        alternatives: ["West Gate", "North Gate"],
    },
    {
        name: "West Gate",
        aliases: ["west gate", "west entrance", "w gate"],
        range: "venue_status!B8:H8",
        alternatives: ["East Gate", "South Gate"],
    },
    {
        name: "Main Stage",
        aliases: ["main stage", "stage", "main arena"],
        range: "venue_status!B9:H9",
        alternatives: ["Side Stage"],
    },
    {
        name: "Restroom",
        aliases: ["restroom", "washroom", "bathroom", "toilet"],
        range: "venue_status!B10:H10",
        alternatives: [],
    },
    {
        name: "Parking",
        aliases: ["parking", "car park", "parking lot"],
        range: "venue_status!B11:H11",
        alternatives: [],
    },
];

// Match a text fragment to a zone (longest match wins)
function matchZone(text) {
    let best = null;
    let bestLen = 0;
    for (const zone of ZONES) {
        for (const alias of zone.aliases) {
            if (text.includes(alias) && alias.length > bestLen) {
                best = zone;
                bestLen = alias.length;
            }
        }
    }
    return best;
}



// Crowd keywords mapped to level
const CROWD_SIGNALS = {
    high: ["crowded", "packed", "full", "congested", "overflow", "jammed", "busy"],
    medium: ["moderate", "normal", "average", "getting busy", "filling up"],
    low: ["empty", "clear", "quiet", "sparse", "free", "no crowd"],
};

function detectCrowdLevel(text) {
    for (const [level, words] of Object.entries(CROWD_SIGNALS)) {
        if (words.some(w => text.includes(w))) return level;
    }
    return null;
}

// Action keywords
const REDIRECT_SIGNALS = ["redirect", "reroute", "move", "divert", "send to", "go to"];
const REDUCE_SIGNALS = ["reduce", "decrease", "limit", "restrict"];
const INCREASE_SIGNALS = ["increase", "add staff", "open more", "expand"];
const ALERT_SIGNALS = ["alert", "warn", "notify", "announce"];


//SMART SOURCE / DESTINATION EXTRACTOR
// Strategy:
// 1. Find "redirect to <zone>" or "to <zone>" as DESTINATION first
// 2. Everything before the redirect keyword is the SOURCE region
// 3. Crowd level is detected from the SOURCE part of the sentence

function extractIntent(command) {
    const cmd = command.toLowerCase();

    // Step 1 – Find redirect separator position
    let redirectIdx = -1;
    let redirectKeyword = null;
    for (const sig of REDIRECT_SIGNALS) {
        const idx = cmd.indexOf(sig);
        if (idx !== -1 && (redirectIdx === -1 || idx < redirectIdx)) {
            redirectIdx = idx;
            redirectKeyword = sig;
        }
    }

    let sourcePart = cmd;
    let destPart = "";

    if (redirectIdx !== -1) {
        sourcePart = cmd.substring(0, redirectIdx);
        destPart = cmd.substring(redirectIdx + (redirectKeyword ? redirectKeyword.length : 0));
    }

    // Step 2 Match source zone (highest priority match in sourcePart)
    const sourceZone = matchZone(sourcePart) || matchZone(cmd);

    // Step 3 Match destination zone in destPart (or full cmd if no separator)
    let destZone = null;
    if (destPart) {
        destZone = matchZone(destPart);
    }
    // If destination = source (mis-detection), try full cmd excluding source aliases
    if (destZone && sourceZone && destZone.name === sourceZone.name) {
        destZone = null;
    }

    // Step 4 Crowd level from sourcePart
    const crowdLevel = detectCrowdLevel(sourcePart) || detectCrowdLevel(cmd);

    // Step 5 Actions
    const actions = {
        redirect: REDIRECT_SIGNALS.some(s => cmd.includes(s)),
        reduce: REDUCE_SIGNALS.some(s => cmd.includes(s)),
        increase: INCREASE_SIGNALS.some(s => cmd.includes(s)),
        alert: ALERT_SIGNALS.some(s => cmd.includes(s)),
    };

    return { sourceZone, destZone, crowdLevel, actions };
}

//WAIT TIME  (heuristic + small random fluctuation)

const BASE_WAIT = { high: 20, medium: 10, low: 3 };

function computeWaitTime(level) {
    const base = BASE_WAIT[level] || 3;
    const jitter = Math.floor(Math.random() * 5) - 2; // 2 min
    return Math.max(1, base + jitter);
}

//  CONFIDENCE SCORER
function scoreConfidence(intent) {
    let score = 0.50;
    if (intent.sourceZone) score += 0.15;
    if (intent.destZone) score += 0.12;
    if (intent.crowdLevel) score += 0.13;
    if (intent.actions.redirect) score += 0.05;
    return Math.min(0.95, Math.max(0.70, parseFloat(score.toFixed(2))));
}

// DECISION BUILDER    
function buildDecision(intent) {
    const { sourceZone, destZone, crowdLevel, actions } = intent;

    // Default (no recognisable intent)
    if (!sourceZone && !crowdLevel) {
        return {
            crowd: "Low",
            waitTime: 3,
            route: "No change",
            alert: "All clear",
            userZone: "",
            destination: "",
        };
    }

    const zoneName = sourceZone ? sourceZone.name : "Unknown Zone";
    const level = crowdLevel || "medium";

    // Determine best route:
    // 1. Explicit destination from command
    // 2. First alternative from zone registry
    // 3. No change
    let route = "No change";
    if (destZone) {
        route = destZone.name;
    } else if (actions.redirect && sourceZone && sourceZone.alternatives.length > 0) {
        route = sourceZone.alternatives[0];
    } else if (level === "high" && sourceZone && sourceZone.alternatives.length > 0) {
        route = sourceZone.alternatives[0];
    }

    // Alert
    let alert = "All clear";
    if (level === "high") {
        alert = `Avoid ${zoneName}`;
    } else if (level === "medium") {
        const suggested = route !== "No change" ? `Try ${route}` : "Moderate";
        alert = suggested;
    } else if (level === "low") {
        alert = "Zone is clear";
    }

    // Special: "reduce" modifier
    let waitTime = computeWaitTime(level);
    if (actions.reduce) waitTime = Math.max(1, waitTime - 5);

    return {
        crowd: level === "high" ? "High" : level === "medium" ? "Medium" : "Low",
        waitTime,
        route,
        alert,
        userZone: zoneName,
        destination: route !== "No change" ? route : "",
    };
}

//REASONING GENERATOR
function generateReasoning(intent, decision) {
    const src = intent.sourceZone ? intent.sourceZone.name : "the zone";
    const dst = decision.route !== "No change" ? decision.route : null;
    const level = intent.crowdLevel;

    if (level === "high" && dst)
        return `High congestion detected at ${src}. Rerouting crowd to ${dst} to balance distribution and reduce wait times.`;
    if (level === "high")
        return `High congestion at ${src}. Crowd management measures activated. Consider opening additional entry points.`;
    if (level === "medium" && dst)
        return `Moderate crowd levels at ${src}. Suggesting ${dst} as an alternative to prevent further build-up.`;
    if (level === "medium")
        return `${src} is experiencing moderate crowd levels. Monitoring situation closely.`;
    if (intent.actions.redirect && dst)
        return `Redirect command received. Moving traffic from ${src} to ${dst}.`;
    if (level === "low")
        return `${src} is currently clear. No immediate action required.`;
    return `Command processed for ${src}. Monitoring crowd levels across all zones.`;
}

// AI HOOK placeholder for future Gemini integration
async function advancedAIProcessing(command) {
    // TODO: const geminiResult = await callGeminiAPI(command);
    return null;
}

// MAIN PROCESS COMMAND
async function processCommand(command) {
    const intent = extractIntent(command);
    const decision = buildDecision(intent);

    // AI hook override (future)
    const aiResult = await advancedAIProcessing(command);
    if (aiResult) Object.assign(decision, aiResult);

    const confidence = scoreConfidence(intent);
    const reasoning = generateReasoning(intent, decision);

    return { intent, decision, confidence, reasoning };
}

// GOOGLE SHEETS UPDATE
// Writes: Crowd Level | Wait Time | Suggested Route | Alert | User Zone | Destination
async function updateSheet(decision, range) {
    if (!sheets) {
        console.warn("??  Skipping sheet update  Sheets client not initialized.");
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
                new Date().toLocaleTimeString()
            ]],
        },
    });
    console.log("?  Sheet updated ?", range);
}

async function logCommand(command, intent, decision, confidence, reasoning) {
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
                reasoning
            ]]
        }
    });
}

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
                new Date().toLocaleTimeString()
            ]]
        }
    });
}

//ROUTES
app.get("/", (req, res) => res.send("EaseEvents Backend Running"));

app.get("/status", (req, res) => {
    res.json({
        service: "EaseEvents Backend",
        version: "3.0.0",
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        sheetsConnected: sheets !== null,
        zones: ZONES.map(z => z.name),
    });
});

app.post("/process-command", async (req, res) => {
    const { command } = req.body || {};

    if (!command || typeof command !== "string" || !command.trim()) {
        return res.status(400).json({ error: "Missing or invalid 'command' field." });
    }

    console.log("??  Incoming command:", command);

    try {
        const { intent, decision, confidence, reasoning } = await processCommand(command);

        const result = {
            crowd: decision.crowd,
            waitTime: decision.waitTime,
            route: decision.route,
            alert: decision.alert,
            confidence,
            reasoning,
        };

        console.log("??  Result:", JSON.stringify(result));

        // Write to the zone's specific sheet row
        const range = intent.sourceZone
            ? intent.sourceZone.range
            : "venue_status!B2:H2";

        await updateSheet(decision, range);
        await logCommand(command, intent, decision, confidence, reasoning);
        if (decision.alert) {
            await updateAlerts(decision);
        }

        res.json({ success: true, result });

    } catch (error) {
        console.error("?  Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

//SERVER
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`??  EaseEvents backend v3.0.0 running on port ${PORT}`);
});