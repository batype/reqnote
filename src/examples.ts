export const examples = {
  json: `curl 'https://api.example.com/v1/orders?access_token=demo-query-token' \\
  -H 'Authorization: Bearer demo-access-token' \\
  -H 'Content-Type: application/json' \\
  --data-raw '{
    "orderId": "ORDER-2026-042",
    "traceId": 1234567890123456789,
    "items": [{"sku": "MATCHA-01", "quantity": 2}],
    "client_secret": "demo-client-secret",
    "customer": {"name": "Ada", "email": "ada@example.com"}
  }'`,
  get: `curl --get 'https://api.example.com/v1/search' \\
  --data-urlencode 'q=React + Vite' \\
  --data-urlencode 'page=1' \\
  -H 'X-API-Key: demo-api-key'`,
  form: `curl 'https://api.example.com/v1/session' \\
  --data-urlencode 'username=demo-user' \\
  --data-urlencode 'password=demo-password' \\
  -H 'Accept: application/json'`,
  cookie: `curl 'https://api.example.com/v1/profile' \\
  -b 'session=demo-session; theme=light' \\
  -H 'Accept: application/json'`
};
export type ExampleKey = keyof typeof examples;
