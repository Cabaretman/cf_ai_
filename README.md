# Live Demo: https://purple-mountain-c545.rafay11hadi.workers.dev

Click this link to use the deployed site and test it out!

# cf_ai_chat_canvas

A compact Cloudflare AI demo: a Worker orchestrates Workers AI (Llama 3.3) with a Durable Object for per-session memory. The static UI is served via asset binding, giving you a full-stack, stateful chat experience on Cloudflare edge.

## What this shows
- **LLM**: Workers AI `@cf/meta/llama-3.3-70b-instruct`
- **Workflow/coordination**: Worker routes + Durable Object for stateful orchestration
- **User input**: Chat UI (Pages-style assets) hitting `/api/chat`
- **Memory/state**: Durable Object stores the running message log per session

## Quick start
1. Install dependencies
   ```bash
   npm install
   ```
2. Authenticate Wrangler (once per machine)
   ```bash
   npx wrangler login
   ```
3. Start the worker against Workers AI (remote model inference)
   ```bash
   npm run dev
   ```
   This serves the UI at the printed localhost URL and proxies model calls via your Cloudflare account.

<!-- Reverted local-only sharing instructions to restore earlier working setup. -->

## API
- `POST /api/session` → `{ sessionId }` to create a new chat session
- `POST /api/chat` with `{ message, sessionId }` → model reply + updated history
- `GET /api/history?sessionId=...` → retrieve stored turns for that session

## Project layout
- `src/worker.js` — Worker entry, routing, AI call, Durable Object logic
- `public/index.html` — Chat UI served through Wrangler assets binding
- `wrangler.toml` — bindings for Workers AI and Durable Object (includes migration tag)
- `PROMPTS.md` — AI prompts used while building this repo

## Deploy
1. Ensure `wrangler.toml` has your desired `name`.
2. Deploy:
   ```bash
   npm run deploy
   ```

## Notes
- The Worker uses a system prompt from `wrangler.toml` (`SYSTEM_PROMPT`). Adjust it to fit your use case.
- Durable Object migrations are declared in `wrangler.toml` (`tag = "v1"`, `new_classes = ["SessionDO"]`). If you change the class name, bump the tag.

