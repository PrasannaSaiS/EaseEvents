/**
 * @fileoverview Crowd Intelligence Engine — core NLP and decision logic.
 * Pure functions with no side effects for testability.
 * @module lib/engine
 */

"use strict";

const { ZONES } = require("../config/zones");

// ─── Crowd Signal Dictionaries ───────────────────────────────────────────────

/** @type {Object<string, string[]>} Keywords mapped to crowd level */
const CROWD_SIGNALS = {
    high: ["crowded", "packed", "full", "congested", "overflow", "jammed", "busy"],
    medium: ["moderate", "normal", "average", "getting busy", "filling up"],
    low: ["empty", "clear", "quiet", "sparse", "free", "no crowd"],
};

// ─── Action Signal Dictionaries ──────────────────────────────────────────────

const REDIRECT_SIGNALS = ["redirect", "reroute", "move", "divert", "send to", "go to"];
const REDUCE_SIGNALS = ["reduce", "decrease", "limit", "restrict"];
const INCREASE_SIGNALS = ["increase", "add staff", "open more", "expand"];
const ALERT_SIGNALS = ["alert", "warn", "notify", "announce"];

// ─── Wait-Time Baselines ────────────────────────────────────────────────────

const BASE_WAIT = { high: 20, medium: 10, low: 3 };

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Matches a text fragment to the best-matching zone using longest-alias-wins strategy.
 * @param {string} text - Lowercased text fragment to match
 * @returns {Zone|null} Best matching zone or null
 */
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

/**
 * Detects crowd level from natural language text.
 * @param {string} text - Lowercased input text
 * @returns {string|null} "high", "medium", "low", or null
 */
function detectCrowdLevel(text) {
    for (const [level, words] of Object.entries(CROWD_SIGNALS)) {
        if (words.some(w => text.includes(w))) return level;
    }
    return null;
}

/**
 * Extracts intent from a natural language command.
 * Strategy:
 *  1. Find "redirect to <zone>" as DESTINATION
 *  2. Everything before the redirect keyword is the SOURCE
 *  3. Crowd level is detected from the SOURCE part
 * @param {string} command - Raw natural language instruction
 * @returns {Object} Extracted intent { sourceZone, destZone, crowdLevel, actions }
 */
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

    // Step 2 – Match source zone
    const sourceZone = matchZone(sourcePart) || matchZone(cmd);

    // Step 3 – Match destination zone
    let destZone = null;
    if (destPart) {
        destZone = matchZone(destPart);
    }
    if (destZone && sourceZone && destZone.name === sourceZone.name) {
        destZone = null;
    }

    // Step 4 – Crowd level
    const crowdLevel = detectCrowdLevel(sourcePart) || detectCrowdLevel(cmd);

    // Step 5 – Actions
    const actions = {
        redirect: REDIRECT_SIGNALS.some(s => cmd.includes(s)),
        reduce: REDUCE_SIGNALS.some(s => cmd.includes(s)),
        increase: INCREASE_SIGNALS.some(s => cmd.includes(s)),
        alert: ALERT_SIGNALS.some(s => cmd.includes(s)),
    };

    return { sourceZone, destZone, crowdLevel, actions };
}

/**
 * Computes estimated wait time with heuristic jitter.
 * @param {string} level - Crowd level ("high", "medium", "low")
 * @returns {number} Estimated wait time in minutes (minimum 1)
 */
function computeWaitTime(level) {
    const base = BASE_WAIT[level] || 3;
    const jitter = Math.floor(Math.random() * 5) - 2;
    return Math.max(1, base + jitter);
}

/**
 * Calculates confidence score based on intent completeness.
 * @param {Object} intent - Extracted intent object
 * @returns {number} Confidence between 0.70 and 0.95
 */
function scoreConfidence(intent) {
    let score = 0.50;
    if (intent.sourceZone) score += 0.15;
    if (intent.destZone) score += 0.12;
    if (intent.crowdLevel) score += 0.13;
    if (intent.actions.redirect) score += 0.05;
    return Math.min(0.95, Math.max(0.70, parseFloat(score.toFixed(2))));
}

/**
 * Builds routing decision based on extracted intent.
 * @param {Object} intent - The extracted intent
 * @returns {Object} Routing decision { crowd, waitTime, route, alert, userZone, destination }
 */
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

    // Determine best route
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

/**
 * Generates human-readable reasoning for the routing decision.
 * @param {Object} intent - The parsed command intent
 * @param {Object} decision - The resulting routing decision
 * @returns {string} Text explaining why the decision was made
 */
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

/**
 * Placeholder for future Gemini / LLM integration.
 * @param {string} _command - Raw command text
 * @returns {Promise<null>} Always returns null until AI hook is enabled
 */
async function advancedAIProcessing(_command) {
    return null;
}

/**
 * Main processing pipeline — orchestrates intent extraction, decision building,
 * confidence scoring, and reasoning generation.
 * @param {string} command - Raw natural language command
 * @returns {Promise<Object>} { intent, decision, confidence, reasoning }
 */
async function processCommand(command) {
    const intent = extractIntent(command);
    const decision = buildDecision(intent);

    const aiResult = await advancedAIProcessing(command);
    if (aiResult) Object.assign(decision, aiResult);

    const confidence = scoreConfidence(intent);
    const reasoning = generateReasoning(intent, decision);

    return { intent, decision, confidence, reasoning };
}

module.exports = {
    matchZone,
    detectCrowdLevel,
    extractIntent,
    computeWaitTime,
    scoreConfidence,
    buildDecision,
    generateReasoning,
    processCommand,
    CROWD_SIGNALS,
    REDIRECT_SIGNALS,
    REDUCE_SIGNALS,
    INCREASE_SIGNALS,
    ALERT_SIGNALS,
};
