# Core Agents

Visual LLM Agent Builder — design, compose, and deploy intelligent agent workflows on a visual canvas.

## Features

- **Visual Flow Editor** — drag-and-drop canvas built with `@xyflow/react` v12. Connect triggers, LLM agents, tools, conditions, and outputs into reusable workflows.
- **Multi-Provider LLM** — Anthropic, OpenAI, and LiteLLM endpoints managed centrally. Select different models per node. Structured JSON output mode for predictable data between steps.
- **Agent Routing** — Branch nodes route execution based on conditions. LLM classifiers determine the path, JSON mode auto-parses into structured fields.
- **MCP Tool Integration** — Connect MCP servers (both SSE and Streamable HTTP). Tools wired into LLM Agent nodes via dedicated tool handles. Built-in tools (store, file, fetch, uuid, now, log) auto-injected into every agent.
- **RAG Pipeline** — Qdrant vector search with configurable embedding providers. Retriever nodes query collections and inject context into LLM prompts.
- **Parallel Execution** — Run multiple sub-nodes concurrently inside Parallel containers. Results merged by node label.
- **Human-in-the-Loop** — Flow pauses for approval with custom buttons. Configurable display and forward fields. Reviewer sees upstream data with resolved template variables.
- **Template Variables** — Use `{{input.Trigger.message}}`, `{{input.Summarizer.transactions[0].amount}}` in system prompts. Autocomplete with arrow keys and mouse selection.
- **Chat Interface** — User-facing chat at `/chat/[flowId]` with SSE streaming, conversation history, and agent routing.
- **Centralized Resource Management** — LLM endpoints, MCP servers, embedding providers, and vector stores all managed from Settings. Select per-node from dropdowns.
- **Input Field Selection** — Per-node checkboxes to control exactly which upstream data passes through. Dot-notation paths for granular field selection.
- **Execution History** — Debug trace per execution with step-by-step input/output/error. Approve/reject for HITL nodes.
- **Scheduling** — Cron-based flow triggers via lightweight scheduler. Valkey + BullMQ queue for scalable execution.
- **Scalable** — Helm chart with Valkey queue, HPA autoscaling, separate scheduler and worker pods. Postgres + Qdrant for storage.

## Architecture

```
┌──────────────┐     HTTP / SSE     ┌──────────────────────┐
│   Frontend    │◄──────────────────►│  Backend (Express 5) │
│  Next.js 16   │                    │  Flow CRUD, Chat     │
│  @xyflow/react│                    │  MCP Hub, SSE        │
│  Tailwind v4  │                    │  Drizzle ORM         │
└──────────────┘                    └──────┬───────────────┘
                                          │
                              ┌───────────▼───────────┐
                              │   Worker (Node.js)     │
                              │  FlowExecutor (DAG)    │
                              │  LLM Providers         │
                              │  Built-in MCP Server   │
                              │  Scheduler / Queue     │
                              └───────────┬───────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
              ┌─────▼─────┐        ┌──────▼──────┐       ┌────▼────┐
              │ PostgreSQL │        │   Qdrant    │       │  Valkey  │
              │ (flows,    │        │ (vector     │       │ (queue)  │
              │  execs,    │        │  search)    │       │          │
              │  store)    │        │             │       │          │
              └───────────┘        └─────────────┘       └─────────┘
```

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, @xyflow/react v12, Tailwind CSS v4, shadcn/ui |
| Backend | Express 5, TypeScript, Drizzle ORM |
| Database | PostgreSQL 17 |
| Vector DB | Qdrant |
| Queue | Valkey 7 + BullMQ |
| Worker | Node.js, @anthropic-ai/sdk, openai, @modelcontextprotocol/sdk |
| LLMs | Anthropic, OpenAI, LiteLLM (and any OpenAI-compatible provider) |
| Infrastructure | Docker, Helm chart for Kubernetes |

## Getting Started

### Prerequisites

- Node.js 25+
- Docker + Docker Compose
- An API key for at least one LLM provider

### Development

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Create database tables
npm run db:migrate

# 3. Start dev servers (backend, worker, frontend)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build
```

### Kubernetes

```bash
helm install core-agents ./helm/core-agents \
  --set anthropicApiKey=sk-ant-... \
  --set openaiApiKey=sk-...
```

## Configuration

### LLM Endpoints

Go to **Settings → LLM Endpoints** and add your providers:
- **Anthropic** — API key + model selection
- **OpenAI** — API key + model selection
- **LiteLLM** — base URL + API key + model selection

### Embedding Providers

For RAG, configure embedding providers in **Settings → Knowledge Bases**.

### MCP Servers

Add MCP servers in **Settings → MCP Servers**. Supports both SSE and Streamable HTTP transports.

## Building a Flow

A typical agent flow:

```
1. Trigger ──→ 2. Retriever ──→ 3. LLM Agent (with tools) ──→ 4. Output
                                 ↕ MCP Tool connection
```

1. **Trigger** — starts the flow (manual, chat, webhook, or schedule)
2. **Retriever** — fetches relevant documents from a Qdrant collection
3. **LLM Agent** — processes input with a system prompt. Connect MCP tools via the purple handle. Use `{{input.Trigger.message}}` templates in your prompt.
4. **Output** — returns the result

### Template Variables

In any system prompt or condition expression, reference upstream data:

```
{{input.Trigger.message}}
{{input.Summarizer.content}}
{{input.Summarizer.transactions[0].amount}}
```

Type `{{` for autocomplete with arrow-key navigation.

### Input Field Selection

Click the checkboxes in the **Select Input Nodes** section to control exactly which upstream data the current node receives. Select entire labels or individual fields using dot-notation paths.

## Project Structure

```
core-agents/
├── frontend/           # Next.js 16 Pages Router
│   └── pages/          # Flow editor, chat, settings, execution history
├── backend/            # Express 5 API server
│   └── src/routes/     # Flows, chat, webhook, MCP, documents, vector stores
├── worker/             # Flow executor + MCP server + scheduler
│   └── src/
│       ├── executor/   # DAG executor (topological sort, node dispatch)
│       ├── providers/  # Anthropic, OpenAI/LiteLLM clients
│       ├── mcp/        # Built-in MCP server (store, file, now, uuid, log, fetch)
│       └── rag/        # Embedding generation, vector store search
├── shared/             # Shared TypeScript types
├── helm/               # Kubernetes Helm chart
└── docker-compose.yml  # Dev infrastructure
```

## Node Types

| Node | Category | Purpose |
|------|----------|---------|
| Trigger | Input | Start a flow (manual, chat, webhook, schedule) |
| LLM Agent | Processing | Call an LLM with system prompt and tools |
| Condition | Processing | Route based on a JavaScript expression |
| Code | Processing | Run JavaScript to transform data |
| Parallel | Processing | Run sub-nodes concurrently |
| MCP Tool | Tools | Call a tool from a configured MCP server |
| Retriever | Tools | Query a vector store for relevant documents |
| Human in the Loop | Processing | Pause for human approval |
| Output | Output | Return the final result |

## Tests

```bash
npx vitest run
```

106 tests across worker, backend, and shared packages.

## License

MIT
