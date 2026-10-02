# FinLife

Financial life simulator for the LPL "Startup from the Future" hackathon. Users connect (mocked) accounts, get a health check, ask "what if," and share a brief with an LPL advisor. Deadline: Oct 3, 9:00 AM PT. A reliable live demo beats extra features.

## Rules
- All math lives in backend/engine. Pure functions on plain dicts, no I/O, no network, no LLM calls, no imports from backend/app.
- The AI never computes or invents numbers. It calls the engine and explains the result. Every number in a reply must come from engine output, the profile, or the events.
- contracts/schema.md is fixed. Do not rename or add fields without asking.
- No investment advice or product recommendations anywhere in the app. Suggested scenarios are phrased as the user's own "What if I..." questions.
- All LLM calls go through Amazon Bedrock using the anthropic package's AnthropicBedrock client. No API keys anywhere. The model ID comes from BEDROCK_MODEL_ID; never hardcode it.
- .env files hold non-secret config only. AWS runs in the organizer's hackathon account: locally, credentials are temporary keys in the `finlife` AWS CLI profile (never in .env or code); in AWS, the Lambda role. Create every AWS client from app/config.py's aws_session(), and pass settings.aws_client_profile to AnthropicBedrock.
- Every reply passes through the Bedrock guardrail before it is returned.
- Every /chat call writes one audit record (DynamoDB finlife-audit in AWS, backend/.local/audit.jsonl locally). A failed write logs an error and never breaks the reply.
- No real personal data. No names, emails, SSNs, or account numbers are collected or stored. Demo personas are fictional. No real bank names or logos.
- The profile comes from a mocked "connect accounts" screen backed by fixtures, or manual entry. Document upload is a stretch goal; do not build it unless asked.

## Stack
- Backend: Python 3.12, FastAPI, Pydantic v2, pytest. Venv at the repo root (.venv). Run from backend/: `..\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000`.
- Frontend: Next.js App Router, TypeScript, Tailwind, Recharts, Framer Motion, lucide-react. Static export (output: "export", trailingSlash: true). No server-only Next.js features, no API routes, no middleware, no server actions.
- AWS: Lambda + Function URL (via Mangum), Bedrock, Bedrock Guardrails, DynamoDB, Amplify Hosting, CloudWatch.
- CORS is handled by FastAPI only. Never also configure CORS on the Function URL; duplicate headers break the browser.

## Ownership
- backend/engine, template.yaml, deploy scripts: Kevin
- backend/app, backend/lambda_handler.py, backend/fixtures: Brian
- frontend: Emi
- contracts/schema.md, CLAUDE.md: whole team; change only with agreement

## Working rules
- TODO.md holds the requirements and task list. Read it before starting a task; when your task's "Done when" checks pass, tick it in the same commit. Edit only your own section.
- Only edit files in the folder you were asked to work in.
- Run tests before saying a task is done: pytest in backend/; npm run lint and npm run build in frontend/.
- Commands must work in Windows PowerShell and macOS.
- Keep files UTF-8 without BOM.
- Prefer small, readable functions. Handle errors with friendly messages, never stack traces in the UI.

@TODO.md
