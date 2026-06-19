<div align="center">

# ⚡ Core Agents

**Visual LLM Agent Builder** — design, compose, and deploy intelligent agent workflows on a drag-and-drop canvas.

![Node.js](https://img.shields.io/badge/Node.js-25+-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![React Flow](https://img.shields.io/badge/React_Flow-12-FF0072?logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Qdrant](https://img.shields.io/badge/Qdrant-1.18-000000?logo=qdrant&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

[✨ Features](#-features) · [🏗️ Architecture](#️-architecture) · [🚀 Getting Started](#-getting-started) · [📖 Usage](#-usage) · [🧪 Tests](#-tests)

---

</div>

## ✨ Features

| | |
|---|---|
| 🎨 **Visual Flow Editor** | Drag-and-drop canvas with React Flow v12. Connect triggers, LLM agents, tools, conditions, and outputs. |
| 🤖 **Multi-Provider LLM** | Anthropic, OpenAI, and LiteLLM. Select models per node. JSON output mode for structured data. |
| 🔀 **Agent Routing** | Branch nodes route execution based on conditions. LLM classifiers determine the path automatically. |
| 🧰 **MCP Tool Integration** | Connect MCP servers (SSE + Streamable HTTP). Tools wired via dedicated handles. Built-in tools auto-injected. |
| 📚 **RAG Pipeline** | Qdrant vector search with configurable embedding providers. Retriever nodes inject context into prompts. |
| ⚡ **Parallel Execution** | Run sub-nodes concurrently inside Parallel containers. Results merged by label. |
| 👤 **Human-in-the-Loop** | Flow pauses for approval with custom buttons, feedback, and role/user assignments. |
| 🧩 **Template Variables** | `{{input.Trigger.message}}`, `{{input.Summarizer.transactions[0].amount}}`. Autocomplete with suggestions. |
| 💬 **Chat Interface** | User-facing chat with SSE streaming, conversation history, and agent routing. |
| ⏰ **Scheduling** | Cron-based triggers via BullMQ queue. Scalable worker pool for background execution. |
| 🛡️ **Role-Based Access** | Admin, editor, and viewer roles with granular permissions. SSO/OIDC support. |
| 🔍 **Execution History** | Step-by-step trace with inputs, outputs, tool calls, and timing breakdown. |

## 🏗️ Architecture

```
┌──────────────┐     HTTP / SSE     ┌──────────────────────┐
│   Frontend    │◄──────────────────►│  Backend (Express 5) │
│  Next.js 16   │                    │  Flow CRUD, Chat     │
│  React Flow   │                    │  Auth, SSE Streaming  │
│  Tailwind v4  │                    │  Drizzle ORM (PG)    │
└──────────────┘                    └──────┬───────────────┘
                                          │
                              ┌───────────▼───────────┐
                              │   Worker (Node.js)     │
                              │  FlowExecutor (DAG)    │
                              │  LLM Providers         │
                              │  Direct Tool Execution  │
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

## 🚀 Getting Started

### Prerequisites

- **Node.js** 25+
- **Docker** + **Docker Compose**
- An **API key** for at least one LLM provider

### Quick Start

```bash
# 1. Clone and install
git clone https://github.com/keeshus/CoreAgents.git
cd core-agents
npm install

# 2. Start infrastructure (PostgreSQL, Qdrant, Valkey)
docker compose up -d

# 3. Run database migrations
cd backend && npm run db:migrate && cd ..

# 4. Start all dev servers
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** — the first user to register becomes admin.

### Running Components Individually

```bash
# Backend API (port 3001)
cd backend && npm run dev

# Worker (processes scheduled and webhook flows via BullMQ)
cd worker && npm run dev:worker

# Scheduler (triggers cron-based flows)
cd worker && npm run dev:scheduler

# Frontend (port 3000)
cd frontend && npm run dev
```

### Deployment

```bash
# Docker Compose (all services)
docker compose -f docker-compose.prod.yml up -d --build

# Kubernetes
helm install core-agents ./helm/core-agents \
  --set anthropicApiKey=sk-ant-... \
  --set openaiApiKey=sk-...
```

## 📖 Usage

### Building a Flow

A typical agent workflow:

```
Trigger ──→ Retriever ──→ LLM Agent ──→ Output
                              ↕
                        MCP Tool (optional)
```

1. **🎯 Trigger** — starts the flow (manual, chat, webhook, or schedule)
2. **📄 Retriever** — fetches relevant documents from a Qdrant collection
3. **🤖 LLM Agent** — processes input with a system prompt. Connect MCP tools via the purple handle
4. **📤 Output** — returns the final result

### Template Variables

Reference upstream data in any system prompt or condition:

```handlebars
{{input.Trigger.message}}
{{input.Summarizer.content}}
{{input.Summarizer.transactions[0].amount}}
```

Type **`{{`** for autocomplete with arrow-key navigation and mouse selection.

### Input Field Selection

Check the **Select Input Nodes** checkboxes to control which upstream data a node receives. Select entire labels or individual fields using dot-notation paths.

## 🧪 Tests

```bash
# Run all tests across all packages
npm test
```

| Package | Tests | Status |
|---------|-------|--------|
| **shared** | 24 | ✅ |
| **worker** | 55 | ✅ |
| **backend** | 45 | ✅ |
| **frontend** | 9 | ✅ |
| **Total** | **133** | ✅ |

## 🗂️ Project Structure

```
core-agents/
├── frontend/                 # Next.js 16 Pages Router
│   ├── pages/                # Flow editor, chat, settings, executions
│   └── src/components/       # Shared UI components
├── backend/                  # Express 5 API server
│   └── src/
│       ├── routes/           # Flows, chat, webhook, auth, admin
│       ├── middleware/        # JWT auth, permission checking
│       └── db/               # Drizzle schema, migrations
├── worker/                   # Flow executor + BullMQ consumer
│   └── src/
│       ├── executor/         # DAG executor, shared runner
│       ├── providers/        # Anthropic, OpenAI/LiteLLM clients
│       ├── tools/            # Built-in tool execution (direct, no MCP)
│       └── rag/              # Embedding generation, vector search
├── shared/                   # Shared TypeScript types
├── helm/                     # Kubernetes Helm chart
└── docker-compose.yml        # Development infrastructure
```

## 🛠️ Configuration

| Setting | Location | Description |
|---------|----------|-------------|
| **LLM Endpoints** | Settings → LLM Endpoints | Anthropic, OpenAI, LiteLLM providers |
| **MCP Servers** | Settings → MCP Servers | External tool servers (SSE/HTTP) |
| **Embedding Providers** | Settings → Knowledge Bases | For RAG pipeline |
| **Vector Stores** | Settings → Knowledge Bases | Qdrant connection settings |
| **Auth** | `.env` → `JWT_SECRET` | JWT signing key (required) |
| **SSO** | `.env` → `AUTH_SSO_*` | OIDC provider (Keycloak, etc.) |

## 📊 Node Types

| Node | Category | Purpose |
|------|----------|---------|
| 🎯 **Trigger** | Input | Start a flow (manual, chat, webhook, schedule) |
| 🤖 **LLM Agent** | Processing | Call an LLM with system prompt and tools |
| 🔀 **Condition** | Processing | Route based on a JavaScript expression |
| 💻 **Code** | Processing | Run JavaScript to transform data |
| ⚡ **Parallel** | Processing | Run sub-nodes concurrently |
| 🧰 **MCP Tool** | Tools | Call a tool from a configured MCP server |
| 📄 **Retriever** | Tools | Query a vector store for relevant documents |
| 👤 **HITL** | Processing | Pause for human approval |
| 🛑 **Stop** | Processing | Terminate execution with a status |
| 📤 **Output** | Output | Return the final result |

## 📄 License

[MIT](LICENSE)

---

<div align="center">
  Built with ❤️ by Kees Hus
</div>
