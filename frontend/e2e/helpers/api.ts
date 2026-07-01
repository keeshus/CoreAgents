import type { APIRequestContext } from '@playwright/test';

export const E2E_USER = {
  name: 'E2E Test User',
  email: 'e2e@test.local',
  password: 'Test1234!',
};

export const E2E_SECOND_USER = {
  name: 'Second User',
  email: 'user2@test.local',
  password: 'Test1234!',
};

const API_URL = 'http://localhost:3001/api';

export async function registerUser(request: APIRequestContext, user: { name: string; email: string; password: string }) {
  const res = await request.post(`${API_URL}/auth/register`, {
    data: user,
  });
  return res;
}

export async function loginUser(request: APIRequestContext, user: { email: string; password: string }) {
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email: user.email, password: user.password },
  });
  return res;
}

export async function createFlow(request: APIRequestContext, flow: { name: string; nodes?: any[]; edges?: any[] }) {
  const res = await request.post(`${API_URL}/flows`, {
    data: flow,
  });
  return res;
}

export async function deleteFlow(request: APIRequestContext, id: string) {
  return request.delete(`${API_URL}/flows/${id}`);
}

export async function isSetupRequired(request: APIRequestContext): Promise<boolean> {
  const res = await request.get(`${API_URL}/auth/setup-status`);
  const data = await res.json();
  return data.required;
}

export async function healthCheck(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${API_URL}/health`);
    return res.ok();
  } catch {
    return false;
  }
}
