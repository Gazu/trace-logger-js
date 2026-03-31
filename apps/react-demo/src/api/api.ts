import { apiClient } from './axios-client';

export async function getHealth() {
  const response = await apiClient.get('/health');
  return response.data;
}