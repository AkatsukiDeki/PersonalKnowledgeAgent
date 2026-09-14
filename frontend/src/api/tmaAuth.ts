import { fetchApi } from './client';

export async function authTMA(initData: string): Promise<{ token: string, user: any }> {
  const res = await fetchApi<{ token: string, user: any }>('auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData })
  });
  return res;
}
