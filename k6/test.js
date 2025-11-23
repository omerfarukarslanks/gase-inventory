import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const USER = { email: 'omer.arslan2@outlook.com', password: '47fa1d516A*' };

export const options = {
  vus: 50,
  duration: '2m',
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<400'] },
};

function login() {
  const res = http.post(`${BASE_URL}/auth/login`, USER);
  check(res, { 'login 200': (r) => r.status === 201 || r.status === 200 });
  return res.json('access_token');
}

export default function () {
  const token = login();
  const params = { headers: { Authorization: `Bearer ${token}` } };

  // Ürün listeleme
  const list = http.get(`${BASE_URL}/products?take=20`, params);
  check(list, { 'products ok': (r) => r.status === 200 });

  // Örnek stok hareketi
  const payload = {
    storeId: 'STORE_ID',
    items: [{ variantId: 'VARIANT_ID', quantity: 1, unitPrice: 100 }],
  };
  const sell = http.post(`${BASE_URL}/inventory/sell`, JSON.stringify(payload), { ...params, headers: { ...params.headers, 'Content-Type': 'application/json' } });
  check(sell, { 'sell ok': (r) => r.status === 201 || r.status === 200 });

  sleep(1);
}
