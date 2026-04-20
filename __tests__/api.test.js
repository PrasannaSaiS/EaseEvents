const request = require('supertest');
const app = require('../server');

describe('EaseEvents API Tests', () => {
    it('GET /status should return 200 and service details', async () => {
        const response = await request(app).get('/status');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('service', 'EaseEvents Backend');
        expect(response.body).toHaveProperty('zones');
    });

    it('POST /process-command should return 400 for empty payload', async () => {
        const response = await request(app).post('/process-command').send({});
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
    });

    it('POST /process-command should correctly route South Gate to North Gate', async () => {
        const response = await request(app)
            .post('/process-command')
            .send({ command: 'South Gate crowded redirect to North Gate' });
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.result).toBeDefined();
        
        const result = response.body.result;
        expect(result.crowd).toBe('High');
        expect(result.route).toBe('North Gate');
        expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('POST /process-command should detect moderate crowd without redirect', async () => {
        const response = await request(app)
            .post('/process-command')
            .send({ command: 'East Gate is experiencing average crowd' });
        
        expect(response.status).toBe(200);
        const result = response.body.result;
        expect(result.crowd).toBe('Medium');
        expect(result.route).toBe('No change');
    });
});
