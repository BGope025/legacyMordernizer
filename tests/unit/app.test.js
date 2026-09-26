// Unit tests for Express app
const request = require('supertest');
const app = require('../../server/app');

describe('GET /api/health', () => {
  it('should return 200 OK', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'OK');
  });
});

describe('API route stubs', () => {
  const routes = ['/api/v1/upload', '/api/v1/plan', '/api/v1/transform', '/api/v1/test'];

  routes.forEach(route => {
    it(`should return 501 for ${route}`, async () => {
      const response = await request(app)
        .get(route)
        .expect(501);

      expect(response.body).toHaveProperty('error', 'Not Implemented');
    });
  });
});

describe('404 handling', () => {
  it('should return 404 for unknown routes', async () => {
    const response = await request(app).get('/api/unknown/route');
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error', 'Not Found');
  });
});