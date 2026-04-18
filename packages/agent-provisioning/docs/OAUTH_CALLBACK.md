# OAuth callback (OpenClaw openai-codex)

Goal: allow user to complete OpenClaw `openai-codex` OAuth for their tenant container.

## Approach (high level)
1) Storefront bot creates tenant and provisions container.
2) Tenant enters `waiting_oauth` state.
3) Storefront bot sends a link:
   `https://<your-domain>/connect/openai?tenant=<tenant_id>&nonce=<nonce>`
4) Web app validates nonce, then initiates OAuth for that tenant runtime.
5) On success, web app marks tenant `oauth_connected` and notifies storefront bot.
6) If OAuth cannot be completed, mark `waiting_api_key` and instruct user to paste API key.

## Notes
- OAuth is interactive; design for failure and fallback.
- Keep the callback service minimal: just connect + status.
