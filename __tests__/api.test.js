const request = require("supertest");
const app = require("../server");

describe("EaseEvents API — Endpoint Tests", () => {

    // ─── Health & Status ────────────────────────────────────────────

    describe("GET /health", () => {
        it("should return 200 with healthy status", async () => {
            const res = await request(app).get("/health");
            expect(res.status).toBe(200);
            expect(res.body.status).toBe("healthy");
            expect(res.body).toHaveProperty("uptime");
            expect(res.body).toHaveProperty("sheetsConnected");
            expect(res.body).toHaveProperty("loggingConnected");
        });
    });

    describe("GET /status", () => {
        it("should return 200 with service details and zones list", async () => {
            const res = await request(app).get("/status");
            expect(res.status).toBe(200);
            expect(res.body.service).toBe("EaseEvents Backend");
            expect(res.body.version).toBe("3.0.0");
            expect(Array.isArray(res.body.zones)).toBe(true);
            expect(res.body.zones.length).toBeGreaterThan(0);
        });

        it("should include Cache-Control header", async () => {
            const res = await request(app).get("/status");
            expect(res.headers["cache-control"]).toContain("max-age");
        });
    });

    // ─── Static File Serving ────────────────────────────────────────

    describe("GET /", () => {
        it("should serve the accessible HTML dashboard", async () => {
            const res = await request(app).get("/");
            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toContain("text/html");
            expect(res.text).toContain("EaseEvents");
        });
    });

    // ─── Input Validation ───────────────────────────────────────────

    describe("POST /process-command — Validation", () => {
        it("should return 400 for empty body", async () => {
            const res = await request(app).post("/process-command").send({});
            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("error");
        });

        it("should return 400 for missing command field", async () => {
            const res = await request(app).post("/process-command").send({ text: "hello" });
            expect(res.status).toBe(400);
        });

        it("should return 400 for non-string command", async () => {
            const res = await request(app).post("/process-command").send({ command: 12345 });
            expect(res.status).toBe(400);
        });

        it("should return 400 for whitespace-only command", async () => {
            const res = await request(app).post("/process-command").send({ command: "   " });
            expect(res.status).toBe(400);
        });

        it("should return 400 for command exceeding 500 characters", async () => {
            const res = await request(app)
                .post("/process-command")
                .send({ command: "a".repeat(501) });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain("500");
        });
    });

    // ─── Core Processing — High Crowd ──────────────────────────────

    describe("POST /process-command — High Crowd Routing", () => {
        it("should route South Gate crowded to North Gate", async () => {
            const res = await request(app)
                .post("/process-command")
                .send({ command: "South Gate crowded redirect to North Gate" });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const r = res.body.result;
            expect(r.crowd).toBe("High");
            expect(r.route).toBe("North Gate");
            expect(r.alert).toBe("Avoid South Gate");
            expect(r.confidence).toBeGreaterThanOrEqual(0.70);
            expect(r.confidence).toBeLessThanOrEqual(0.95);
            expect(typeof r.reasoning).toBe("string");
            expect(r.reasoning.length).toBeGreaterThan(0);
        });

        it("should auto-select alternative when no destination given", async () => {
            const res = await request(app)
                .post("/process-command")
                .send({ command: "East Gate is packed" });

            expect(res.status).toBe(200);
            const r = res.body.result;
            expect(r.crowd).toBe("High");
            expect(r.route).not.toBe("No change");
        });
    });

    // ─── Core Processing — Medium Crowd ────────────────────────────

    describe("POST /process-command — Medium Crowd", () => {
        it("should detect moderate crowd without redirect", async () => {
            const res = await request(app)
                .post("/process-command")
                .send({ command: "East Gate is experiencing average crowd" });

            expect(res.status).toBe(200);
            const r = res.body.result;
            expect(r.crowd).toBe("Medium");
            expect(r.route).toBe("No change");
        });
    });

    // ─── Core Processing — Low Crowd ───────────────────────────────

    describe("POST /process-command — Low Crowd", () => {
        it("should detect low/clear crowd", async () => {
            const res = await request(app)
                .post("/process-command")
                .send({ command: "Parking is empty" });

            expect(res.status).toBe(200);
            const r = res.body.result;
            expect(r.crowd).toBe("Low");
            expect(r.alert).toBe("Zone is clear");
        });
    });

    // ─── Core Processing — Unknown Zone ────────────────────────────

    describe("POST /process-command — Unknown Zone", () => {
        it("should return default decision for unrecognised command", async () => {
            const res = await request(app)
                .post("/process-command")
                .send({ command: "hello world" });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const r = res.body.result;
            expect(r.crowd).toBe("Low");
            expect(r.route).toBe("No change");
            expect(r.alert).toBe("All clear");
        });
    });

    // ─── Response Schema Validation ────────────────────────────────

    describe("POST /process-command — Response Schema", () => {
        it("should always return the correct response structure", async () => {
            const res = await request(app)
                .post("/process-command")
                .send({ command: "North Gate congested redirect to South Gate" });

            expect(res.status).toBe(200);
            const r = res.body.result;
            expect(r).toHaveProperty("crowd");
            expect(r).toHaveProperty("waitTime");
            expect(r).toHaveProperty("route");
            expect(r).toHaveProperty("alert");
            expect(r).toHaveProperty("confidence");
            expect(r).toHaveProperty("reasoning");
            expect(typeof r.waitTime).toBe("number");
            expect(r.waitTime).toBeGreaterThanOrEqual(1);
        });
    });

    // ─── Security Headers ──────────────────────────────────────────

    describe("Security Headers", () => {
        it("should include helmet security headers", async () => {
            const res = await request(app).get("/status");
            expect(res.headers).toHaveProperty("x-content-type-options");
            expect(res.headers["x-content-type-options"]).toBe("nosniff");
        });

        it("should include content-security-policy", async () => {
            const res = await request(app).get("/status");
            expect(res.headers).toHaveProperty("content-security-policy");
        });
    });
});
