# N8N Gemini React Clone

Simple React app styled like Gemini with:

- dark mode and light mode
- local chat history
- n8n webhook integration
- Firebase Google login support

## Webhook

The app is already connected by default to:

`https://akki190804.app.n8n.cloud/webhook/fc3c4c7d-0a22-45c3-961a-7ba309d8dedf`

You can also override it in `.env`:

`VITE_N8N_WEBHOOK_URL=your_webhook_url`

## Firebase

Copy `.env.example` to `.env` and fill these values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

If Firebase is not configured, the app still works for chat, but Google login will not open.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
