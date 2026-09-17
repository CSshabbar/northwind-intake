# Run Northwind intake locally

Branch: `cursor/intake-console-ui-da12`  
Phone: **+1 (531) 213-1028**  
Public Cloudflare preview: **down** until a new tunnel + `npm run provision`.

## Clone

```bash
git clone https://origin.cursor.com/git/idiaz/tmp-96a294e644c57b34.git northwind-intake
cd northwind-intake
git checkout cursor/intake-console-ui-da12
```

Node 22+. macOS needs Xcode CLT; Linux needs `build-essential`.

## Env (names only)

```bash
cp .env.example .env.local
openssl rand -hex 32
```

Paste into `.env.local`:

- `VAPI_API_KEY` — Call Avery / phone tools
- `GROQ_API_KEY` — `npm run provision` only
- `VAPI_WEBHOOK_SECRET` — the openssl value
- `PUBLIC_API_URL` — only if voice should save charts (tunnel URL)

Never commit `.env.local`.

## Start

```bash
npm install
npm test
npm run dev
```

Open http://127.0.0.1:43145

## Verify

- Desk: Today, Patients (Jane Doe), Schedule, Calls
- `curl http://127.0.0.1:43145/patients` and `/api/health`
- Call Avery → `/call` (charts save only after tunnel + `npm run provision`)
