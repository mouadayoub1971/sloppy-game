# Private AI game integration (offline review)

This patch extends source snapshot `12552abf9101f1bf6bcf559824cb8a8d6f8ced0e`. It does not contain the parent's separately uploaded assets or alter Site access, secrets, or deployment settings.

## Implemented behavior

The static game starts in local mode. “Try AI chat” establishes a same-origin, HttpOnly session and opens separate Nova/Vale conversations. Each character receives only its own conversation, own trust and opening instinct, plus completed public results. Both chats are visible to their player, but neither character receives the rival's messages or unrevealed choice. Chat content is processed by OpenRouter and the selected provider; it is not end-to-end encrypted.

Each valid model reply stages one of `left`, `center`, or `right`, a short dialogue line, and a public explanation. A kick uses those exact staged directions, and its result displays their saved explanations. A character with no staged reply is asked to choose when the player presses Play. The backend owns match state and rejects stale round/game identifiers. No model calls occur for animation, voice replay, Next, or New match. Generated reactions use the existing speech-synthesis fallback when no prerecorded clip matches.

Unavailable AI leaves local play usable; an active AI session has a “Play locally” control that starts a fresh local match. Failed message drafts remain in the textarea. Retrying the same draft uses its existing request ID. The offline local game does not pretend its scripted decisions came from DeepSeek.

## Runtime contract and activation (not performed)

- Worker ESM entry: `worker/index.js` (or `build-worker/worker/index.js` after `npm run build`). Default export has `fetch(request, env)`.
- Public assets: `dist/`. Only these assets may be publicly served. Keep `worker/`, `migrations/`, tests, and backend build output out of the public asset directory. Route `/api/*` through the Worker before the asset handler; other requests use `env.ASSETS.fetch`.
- D1 binding: `DB`, shared by **all** players and test invocations. `migrations/0001_ai.sql` is a one-time schema migration, not runtime initialization. The Site owner must integrate this schema into the existing Sites migration pipeline (including its generated Drizzle metadata, if used) and preserve the Site project identity. Do not recreate the database or ledger on each deployment.
- Future hosted binding: `OPENROUTER_KEY`. No real value was read, copied, configured, or used in this task. Never put it in a browser bundle or plaintext source.
- Non-secret settings: `AI_ENABLED=true`, `OPENROUTER_MODEL=<official verified exact model ID>`, and `VERIFIED_MODEL=<same exact ID>`. They are absent by default, so the API fails closed. Verify the requested **DeepSeek V4.1 Flash** model ID, current price, tokenizer/context overhead, JSON-schema support, disabled-reasoning support, returned model ID, and availability under the routing caps before enabling. There is deliberately no guessed model ID or silent substitute. A strict response-model equality check may need an explicitly verified canonical ID mapping.
- Require a provider-side remaining spending cap no higher than the user's remaining $5 allowance before live activation. It covers provider billing outside the application's control. Account for any spending performed outside this ledger before activation; this offline task spent $0. External tests must not bypass the same ledger.
- The saved coding environment separately needs its existing credential configured as a managed **network secret**, not a raw environment variable, and HTTPS `openrouter.ai:443` allowed. Start a new task after that saved configuration changes. Do not copy the currently exposed environment variable into hosting.
- No deployment or persistent access changes were made. The parent still needs to merge this source patch with the uploaded assets and existing Site configuration.

## Spending and failure behavior

Money is recorded as integer microdollars. A SQLite BEFORE INSERT trigger reserves **50,000 microdollars ($0.05)** before the only upstream call. It rejects any insert taking the sum above **5,000,000 ($5)**. Reservations are permanently retained, even after a successful cheap call or a failed call. This conservative scheme permits at most 100 attempted calls across all sessions, including tests; it intentionally stops before the actual spend reaches $5. Two live test calls consume at most $0.10 of this reserved allowance.

The provider request has `max_tokens:256`, no reasoning, no tools, no plugins, no streaming, no retries, no provider fallback, and `provider.max_price={prompt:1,completion:2,request:0}` (USD per million input/output tokens, with zero per-request fee). The serialized request is capped at 20,000 UTF-8 bytes. Assuming the verified model's tokenizer uses no more than one token per byte and at most 4,096 additional envelope tokens, the bound is $0.024608, below the $0.05 reservation. These assumptions and provider billing must be verified before activation; the independent provider cap is the final guard against out-of-contract billing. See [OpenRouter routing price caps](https://openrouter.ai/docs/guides/routing/provider-selection#max-price).

A timeout, malformed reply, unexpected model, missing/negative/nonfinite cost, cost above the reservation, or persistence failure never produces an AI decision or refunds a reservation. An uncertain upstream result records a global stop when storage is reachable. If storage itself fails, all dependent endpoints fail closed. A crash between reservation and reconciliation leaves its full reservation and the session's pending lock in place. Never automatically unlock/retry an ambiguous request. Inspect provider billing before manual recovery; preserve every reserved amount.

Request IDs are scoped to an HttpOnly session. A replay returns the saved response without a new call; reuse with different content conflicts. One pending call locks a session against chat or match mutations. Revision checks prevent stale reads from overwriting newer state. SQLite triggers validate the expected session revision before marking a request complete and commit the reply and session update in one atomic statement. A conflicting revision rolls the entire statement back. Returned prompt/output token counts are required and bounded; missing or excessive usage also stops AI. Rate limits are four attempts/session/minute, six/IP/minute, and twenty globally/minute. Session creation is also limited. Cloudflare's trusted `CF-Connecting-IP` is hashed before storage. Public visitors can still consume the shared allowance within these limits; this is a bounded public playtest, not an authenticated invite system.

Session cookies expire after 24 hours. The current schema retains conversation state and idempotent responses in D1; plan retention cleanup before wider release. Cleanup may redact old session state and response text but must preserve reservation amounts, request identities/status, and global stop records. Do not delete ledger rows to recover capacity.

## Verification

- `npm test` runs the original engine scenarios and Worker integration tests using real SQLite through a small D1-compatible test adapter, with mocked upstream responses only.
- `npm run build` emits ESM Worker modules; no network or credentials are required.
- `PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs npm run test:browser` runs an offline Chromium smoke test. Set `CHROMIUM_PATH` if Chromium is not `/usr/bin/chromium`. It uses a loopback server, test-only bindings and two mocked calls, never environment OpenRouter credentials.
- Browser coverage: separate messages, actual AI directions driving animation, explanation display, next kick, mobile overflow, switch to local mode, continued local play, and no page JavaScript errors. Source-only testing lacks the parent's still-separate image/audio assets; this is not a final asset or deployed-D1 check.

Before release, verify the assembled Site assets, hosting migration and Worker asset routing, real D1 behavior, and the explicitly capped live test. Keep AI disabled until all activation requirements above are met.

## Pre-PR security review

Seventeen offline tests pass after correcting two review findings: session/reply completion now validates revisions inside the atomic SQL statement (not after commit), and upstream prompt/output token usage must be present and within the request bounds. Tests also cover simultaneous final-budget reservations, integer ledger amounts, negative/missing/over-limit cost rejection, duplicate and altered request IDs, lost connections without refunds, unauthenticated/expired sessions, and adversarial prompts that have no rival data or tools available. Browser smoke checks pass with mocked responses.

Model-provided explanations remain generated statements, not a guarantee of the model's hidden reasoning. Prompt injection can influence a character's response or chosen direction, as ordinary gameplay can, but it has no retrieval tools, database access, credentials, or rival private history in context. Rendered messages use textContent rather than HTML.
