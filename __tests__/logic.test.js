/**
 * Unit tests for the Crowd Intelligence Engine (lib/engine.js).
 * Tests pure logic functions independently from Express routes.
 */

const {
    matchZone,
    detectCrowdLevel,
    extractIntent,
    computeWaitTime,
    scoreConfidence,
    buildDecision,
    generateReasoning,
    processCommand,
} = require("../lib/engine");

// ─── matchZone ──────────────────────────────────────────────────────────────

describe("matchZone()", () => {
    it("should match exact alias", () => {
        const zone = matchZone("south gate");
        expect(zone).not.toBeNull();
        expect(zone.name).toBe("South Gate");
    });

    it("should match alias within a longer string", () => {
        const zone = matchZone("the north gate is busy");
        expect(zone).not.toBeNull();
        expect(zone.name).toBe("North Gate");
    });

    it("should return longest match when multiple aliases overlap", () => {
        const zone = matchZone("food court a");
        expect(zone.name).toBe("Food Court A");
    });

    it("should return null for unknown text", () => {
        expect(matchZone("unknown location xyz")).toBeNull();
    });

    it("should match alternative alias forms", () => {
        const zone = matchZone("the washroom is full");
        expect(zone).not.toBeNull();
        expect(zone.name).toBe("Restroom");
    });
});

// ─── detectCrowdLevel ───────────────────────────────────────────────────────

describe("detectCrowdLevel()", () => {
    it("should detect high crowd signals", () => {
        expect(detectCrowdLevel("it is very crowded")).toBe("high");
        expect(detectCrowdLevel("gate is packed")).toBe("high");
        expect(detectCrowdLevel("overflow at south")).toBe("high");
    });

    it("should detect medium crowd signals", () => {
        expect(detectCrowdLevel("moderate crowd here")).toBe("medium");
        expect(detectCrowdLevel("filling up fast")).toBe("medium");
    });

    it("should detect low crowd signals", () => {
        expect(detectCrowdLevel("area is empty")).toBe("low");
        expect(detectCrowdLevel("it is quiet today")).toBe("low");
    });

    it("should return null for no signal", () => {
        expect(detectCrowdLevel("hello world")).toBeNull();
    });
});

// ─── extractIntent ──────────────────────────────────────────────────────────

describe("extractIntent()", () => {
    it("should extract source, destination, crowd, and redirect action", () => {
        const intent = extractIntent("South Gate crowded redirect to North Gate");
        expect(intent.sourceZone.name).toBe("South Gate");
        expect(intent.destZone.name).toBe("North Gate");
        expect(intent.crowdLevel).toBe("high");
        expect(intent.actions.redirect).toBe(true);
    });

    it("should extract source without destination when no redirect keyword", () => {
        const intent = extractIntent("East Gate is packed");
        expect(intent.sourceZone.name).toBe("East Gate");
        expect(intent.destZone).toBeNull();
        expect(intent.crowdLevel).toBe("high");
        expect(intent.actions.redirect).toBe(false);
    });

    it("should detect reduce action", () => {
        const intent = extractIntent("reduce crowd at south gate");
        expect(intent.actions.reduce).toBe(true);
    });

    it("should detect alert action", () => {
        const intent = extractIntent("alert everyone about main stage");
        expect(intent.actions.alert).toBe(true);
    });

    it("should handle command with no recognisable zone", () => {
        const intent = extractIntent("hello world");
        expect(intent.sourceZone).toBeNull();
        expect(intent.destZone).toBeNull();
        expect(intent.crowdLevel).toBeNull();
    });

    it("should not set destination = source when same zone detected", () => {
        const intent = extractIntent("south gate redirect to south gate area");
        expect(intent.destZone).toBeNull();
    });
});

// ─── computeWaitTime ────────────────────────────────────────────────────────

describe("computeWaitTime()", () => {
    it("should return wait time >= 1 for high crowd", () => {
        for (let i = 0; i < 20; i++) {
            expect(computeWaitTime("high")).toBeGreaterThanOrEqual(1);
        }
    });

    it("should return wait time >= 1 for low crowd", () => {
        for (let i = 0; i < 20; i++) {
            expect(computeWaitTime("low")).toBeGreaterThanOrEqual(1);
        }
    });

    it("should return wait time >= 1 for unknown level", () => {
        expect(computeWaitTime("unknown")).toBeGreaterThanOrEqual(1);
    });
});

// ─── scoreConfidence ────────────────────────────────────────────────────────

describe("scoreConfidence()", () => {
    it("should return max 0.95 for fully matched intent", () => {
        const intent = {
            sourceZone: { name: "South Gate" },
            destZone: { name: "North Gate" },
            crowdLevel: "high",
            actions: { redirect: true },
        };
        expect(scoreConfidence(intent)).toBe(0.95);
    });

    it("should return min 0.70 for empty intent", () => {
        const intent = {
            sourceZone: null,
            destZone: null,
            crowdLevel: null,
            actions: { redirect: false },
        };
        expect(scoreConfidence(intent)).toBe(0.70);
    });

    it("should return value between 0.70 and 0.95", () => {
        const intent = {
            sourceZone: { name: "Test" },
            destZone: null,
            crowdLevel: "medium",
            actions: { redirect: false },
        };
        const score = scoreConfidence(intent);
        expect(score).toBeGreaterThanOrEqual(0.70);
        expect(score).toBeLessThanOrEqual(0.95);
    });
});

// ─── buildDecision ──────────────────────────────────────────────────────────

describe("buildDecision()", () => {
    it("should return default decision for empty intent", () => {
        const d = buildDecision({
            sourceZone: null,
            destZone: null,
            crowdLevel: null,
            actions: { redirect: false, reduce: false, increase: false, alert: false },
        });
        expect(d.crowd).toBe("Low");
        expect(d.route).toBe("No change");
        expect(d.alert).toBe("All clear");
    });

    it("should route to explicit destination", () => {
        const d = buildDecision({
            sourceZone: { name: "South Gate", alternatives: ["North Gate"] },
            destZone: { name: "West Gate" },
            crowdLevel: "high",
            actions: { redirect: true, reduce: false, increase: false, alert: false },
        });
        expect(d.route).toBe("West Gate");
    });

    it("should auto-route to first alternative when redirecting without dest", () => {
        const d = buildDecision({
            sourceZone: { name: "South Gate", alternatives: ["North Gate", "East Gate"] },
            destZone: null,
            crowdLevel: "high",
            actions: { redirect: true, reduce: false, increase: false, alert: false },
        });
        expect(d.route).toBe("North Gate");
    });

    it("should reduce wait time when reduce action is present", () => {
        const results = [];
        for (let i = 0; i < 20; i++) {
            const d = buildDecision({
                sourceZone: { name: "South Gate", alternatives: [] },
                destZone: null,
                crowdLevel: "high",
                actions: { redirect: false, reduce: true, increase: false, alert: false },
            });
            results.push(d.waitTime);
        }
        expect(results.every(t => t >= 1)).toBe(true);
    });

    it("should set alert to 'Zone is clear' for low crowd", () => {
        const d = buildDecision({
            sourceZone: { name: "Parking", alternatives: [] },
            destZone: null,
            crowdLevel: "low",
            actions: { redirect: false, reduce: false, increase: false, alert: false },
        });
        expect(d.alert).toBe("Zone is clear");
    });
});

// ─── generateReasoning ──────────────────────────────────────────────────────

describe("generateReasoning()", () => {
    it("should explain high crowd rerouting", () => {
        const r = generateReasoning(
            { sourceZone: { name: "South Gate" }, crowdLevel: "high", actions: { redirect: true } },
            { route: "North Gate" }
        );
        expect(r).toContain("High congestion");
        expect(r).toContain("South Gate");
        expect(r).toContain("North Gate");
    });

    it("should explain medium crowd monitoring", () => {
        const r = generateReasoning(
            { sourceZone: { name: "East Gate" }, crowdLevel: "medium", actions: {} },
            { route: "No change" }
        );
        expect(r).toContain("moderate");
    });

    it("should explain low crowd status", () => {
        const r = generateReasoning(
            { sourceZone: { name: "Parking" }, crowdLevel: "low", actions: {} },
            { route: "No change" }
        );
        expect(r).toContain("clear");
    });

    it("should handle redirect without crowd level", () => {
        const r = generateReasoning(
            { sourceZone: { name: "Main Stage" }, crowdLevel: null, actions: { redirect: true } },
            { route: "Side Stage" }
        );
        expect(r).toContain("Redirect");
    });

    it("should produce fallback reasoning when no specific match", () => {
        const r = generateReasoning(
            { sourceZone: { name: "Unknown" }, crowdLevel: null, actions: {} },
            { route: "No change" }
        );
        expect(r).toContain("Monitoring");
    });
});

// ─── processCommand (Integration) ───────────────────────────────────────────

describe("processCommand()", () => {
    it("should return complete result object", async () => {
        const result = await processCommand("South Gate crowded redirect to North Gate");
        expect(result).toHaveProperty("intent");
        expect(result).toHaveProperty("decision");
        expect(result).toHaveProperty("confidence");
        expect(result).toHaveProperty("reasoning");
        expect(result.decision.crowd).toBe("High");
        expect(result.decision.route).toBe("North Gate");
    });
});
