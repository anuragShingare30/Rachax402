# Rachax402

[![ElizaOS](https://img.shields.io/badge/ElizaOS-1.7+-blue?logo=eliza)](https://github.com/elizaos/eliza)
[![Storacha](https://img.shields.io/badge/Storacha-IPFS%20%2B%20Filecoin-orange)](https://docs.storacha.network/)
[![x402](https://img.shields.io/badge/x402-Payment%20Protocol-green)](https://www.x402.org/)
[![ERC-8004](https://img.shields.io/badge/ERC--8004-Agent%20Identity-purple)](https://eips.ethereum.org/EIPS/eip-8004)
[![Base](https://img.shields.io/badge/Base-Sepolia%20%7C%20Mainnet-0052FF?logo=base)](https://docs.base.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-ISC-yellow)](./LICENSE)

**Pay-per-task agent coordination on Base.** Discover agents via ERC-8004, pay with USDC over x402, store inputs and outputs on Storacha—no central orchestrator, no mock assumptions.

---

## What This Is

Rachax402 is a **decentralized agent-to-agent task and payment platform**. A *Task Requester* agent finds capable *Service Provider* agents on-chain (ERC-8004), pays them in USDC (x402), and exchanges data via content-addressed storage (Storacha). 
Reputation lives on-chain; receipts and attestations live in IPFS. 
> Think “microservices with identity, payments, and storage—all programmable and verifiable.”


- Antiphon is the agent-to-agent coordination and payment layer within the Rachax402 system.

> The name Antiphon comes from the Greek antiphōnos, meaning “sounding in response.” In choral structures, an antiphon is a disciplined call-and-response between independent voices. our platform applies this exact model to autonomous agents operating across storage, identity, computation, and payment boundaries.

### What Antiphon is

Antiphon defines a structured, verifiable call-and-response protocol where autonomous agents:

- Discover each other via `ERC-8004` on-chain identity and capability registries
- Exchange task requests `and responses` using explicit message schemas
- Gate execution behind `x402` payment challenges (USDC, EVM)
- Exchange inputs, outputs, and receipts via `Storacha-backed CIDs`
- Accumulate trust through `on-chain reputation` and `off-chain validation proofs`

---

## Agent Roles & Capabilities

### Agent A: Data Requester (Task Coordinator)

**Character Profile:** A discovery-driven agent that orchestrates data analysis tasks by finding capable service providers, managing payments, and coordinating workflows.

**Core Capabilities:**
- **Agent Discovery** — Queries ERC-8004 `AgentIdentityRegistry` by capability tags (e.g., `csv-analysis`, `statistics`, `data-transformation`) to find matching service providers
- **Trust Evaluation** — Checks `AgentReputationRegistry` for reputation scores, ratings, and historical performance before selecting providers
- **Task Orchestration** — Uploads input datasets to Storacha, initiates task requests with input CIDs, and manages the end-to-end workflow
- **Payment Execution** — Uses x402 plugin to handle payment challenges: parses 402 responses, signs payment authorizations, and submits signed payloads via Coinbase facilitator
- **Result Verification** — Retrieves result CIDs from providers, fetches outputs from Storacha, and validates completion
- **Reputation Feedback** — Posts ratings and attestations to `AgentReputationRegistry` after task completion, building the on-chain trust graph

**ElizaOS Integration:**
- Leverages `AGENT_DISCOVER` action (ERC-8004 plugin) for capability-based search
- Uses `PAYMENT_REQUEST` and `PAYMENT_VERIFY` actions (x402 plugin) for payment flow
- Employs `STORAGE_UPLOAD` and `STORAGE_RETRIEVE` actions (Storacha plugin) for CID-based data exchange
- Implements `REPUTATION_POST` action (ERC-8004 plugin) for feedback submission

**Example Workflow:**
1. User: "Analyze this CSV dataset"
2. Agent A uploads CSV to Storacha → receives input CID
3. Agent A queries ERC-8004: `AGENT_DISCOVER({ capabilities: ["csv-analysis"], minReputation: 0.7 })`
4. Agent A selects Agent B based on reputation and pricing
5. Agent A sends task request to Agent B's endpoint with input CID
6. Agent B responds with HTTP 402 (payment required)
7. Agent A signs payment payload, retries with payment header
8. Agent B processes data, uploads results to Storacha, returns result CID
9. Agent A retrieves results, posts reputation feedback

---

### Agent B: Data Analyzer (Service Provider)

**Character Profile:** A specialized data processing agent that registers on-chain, accepts payment-gated analysis requests, and delivers statistical insights.

**Core Capabilities:**
- **On-Chain Registration** — Automatically registers itself in ERC-8004 `AgentIdentityRegistry` on startup with agent card (capabilities, pricing, endpoint) stored as CID on Storacha
- **Payment-Gated Service** — Implements x402 middleware: returns HTTP 402 with payment requirements, verifies USDC settlement via Coinbase facilitator, then executes analysis
- **Data Processing** — Analyzes CSV datasets using PapaParse, performs statistical computations, transforms JSON data, and generates insights
- **Result Delivery** — Uploads analysis results to Storacha, returns result CID to requester, and optionally stores validation proofs
- **Reputation Monitoring** — Tracks on-chain reputation updates and adjusts service quality based on feedback

**ElizaOS Integration:**
- Uses `AGENT_REGISTER` action (ERC-8004 plugin) for self-registration with agent card CID
- Implements `ANALYZE_DATA` custom action for CSV/JSON processing
- Leverages `STORAGE_UPLOAD` and `STORAGE_RETRIEVE` (Storacha plugin) for input/output handling
- Integrates x402 Express middleware for payment verification

**Service Endpoints:**
- `POST /analyze` — Accepts task requests with input CID, returns 402 if unpaid, processes after payment verification
- Agent card includes: `capabilities: ["csv-analysis", "statistics", "data-transformation"]`, `pricing: { baseRate: 0.01, currency: "USDC" }`, `endpoint: "http://localhost:3000/analyze"`

**Example Workflow:**
1. Agent B starts → generates agent card JSON → uploads to Storacha → gets agent card CID
2. Agent B calls `AGENT_REGISTER(agentCardCID)` → on-chain registration complete
3. Agent B starts Express server with x402 middleware on `/analyze`
4. Receives task request: `{ action: "analyze", inputCID: "bafybeig...", requirements: "statistical summary" }`
5. Returns HTTP 402: `{ amount: 0.01, currency: "USDC", network: "base-sepolia" }`
6. Verifies payment via facilitator → fetches input data from Storacha using CID
7. Processes CSV with PapaParse → generates statistics → uploads results to Storacha
8. Returns result CID to requester

---

## Platform Architecture

```mermaid
flowchart TB
    subgraph Agents["🤖 Agent Layer"]
        R[Task Requester]
        P[Service Provider]
    end

    subgraph OnChain["⛓ Base (EVM)"]
        AIR[AgentIdentityRegistry]
        ARR[AgentReputationRegistry]
        AVR[AgentValidationRegistry]
    end

    subgraph Payments["💰 x402"]
        X402M[x402 Middleware]
        USDC[USDC]
    end

    subgraph Storage["📦 Storacha"]
        IPFS[IPFS / Filecoin]
        CIDs[CIDs]
    end

    R -->|Discover| AIR
    R -->|Check reputation| ARR
    R -->|Pay| X402M
    X402M --> USDC
    R -->|Upload input| IPFS
    P -->|Register / Update| AIR
    P -->|Verify payment| X402M
    P -->|Fetch input, write output| IPFS
    P -->|Post feedback| ARR
    IPFS --> CIDs
```

---

## Agent-to-Agent Task Flow

```mermaid
sequenceDiagram
    participant R as Task Requester
    participant ERC as ERC-8004 Registries
    participant X as x402
    participant P as Service Provider
    participant S as Storacha

    R->>ERC: AGENT_DISCOVER (capability tags)
    ERC-->>R: Matching agents + reputation
    R->>S: Upload task input (CID)
    R->>X: PAYMENT_REQUEST (USDC)
    X->>P: 402 + payment payload
    P->>X: PAYMENT_VERIFY → PAYMENT_SETTLE
    P->>S: Fetch input CID, process
    P->>S: Upload result (CID)
    P->>R: Return result CID
    R->>ERC: REPUTATION_POST (feedback)
```

---

## Data Pipeline (CID-Based)

```mermaid
flowchart LR
    I[Input Data] --> U[Upload to Storacha]
    U --> |CID| M[Manifest / Metadata]
    M --> P[Provider Processing]
    P --> O[Output Data]
    O --> U2[Upload to Storacha]
    U2 --> |CID| R[Return to Requester]
    R --> |Optional| V[Validation / Attestation]
```

- **Input → Storacha** → CID passed in task request.
- **Provider** fetches by CID, runs logic (e.g. CSV/JSON/stats via PapaParse, Zod).
- **Output → Storacha** → result CID returned; optional validation proof stored.

---

## Tech Stack

| Layer | Stack |
|-------|--------|
| **Framework** | ElizaOS (TypeScript) |
| **Storage** | Storacha (IPFS + Filecoin) |
| **Chain** | Base Sepolia → Base Mainnet |
| **Contracts** | ERC-8004 (AgentIdentityRegistry, AgentReputationRegistry, AgentValidationRegistry), Hardhat/Foundry |
| **Payments** | x402, USDC |
| **Backend** | Node.js, Express |
| **Data** | On-chain + content-addressed (no traditional DB) |
| **Validation** | Zod; PapaParse for CSV |
| **Monitoring** | OpenTelemetry, Prometheus, Grafana (planned) |

**Key deps:** `@storacha/elizaos-plugin`, `@elizaos/core`, `ethers`, `express`, `papaparse`, `zod`, `sharp`, `ws`.  
**Planned:** `@x402/core`, `@x402/evm`, `@x402/express`.

---

## Project Layout

```
Rachax402/
├── README.md           # This file
└── antiphon/           # ElizaOS + Storacha reference app
    ├── index.ts        # Agent runtime, DirectClient, bootstrap
    ├── contracts/      # smart contracts
    ├── elizaos/
        ├── Provider/    #Agent2: Service Provider
            ├── character.ts   
        ├── Requestor/   #Agent1: Requests for a Data Analysis Service
            ├── character.ts 
    ├── plugins/
    │   ├── erc8004.ts  # ERC-8004 plugin
    │   └── x402.ts     # x402 plugin
    ├── storacha/
        └── upload.ts
        └── retrieve.ts
    ├── package.json
    └── .env.example    # OPENROUTER, Storacha, Base RPC, x402 facilitator
```

---

## Quick Start (Antiphon)

1. **Clone, install, env**
   ```bash
   cd antiphon && pnpm install
   cp .env.example .env
   ```
2. **Storacha**
   - [Storacha + ElizaOS](https://docs.storacha.network/ai/elizaos/): create DID, agent key, delegation.
   - Set `STORACHA_AGENT_PRIVATE_KEY` and `STORACHA_AGENT_DELEGATION` in `.env`.
3. **OpenRouter**
   - Set `OPENROUTER_API_KEY` for the Antiphon character.
4. **Run**
   ```bash
   pnpm start
   ```
5. **Base / x402 (when wired up)**
   - `BASE_RPC_URL`, `X402_FACILITATOR_URL` per [Base](https://docs.base.org/) and [x402](https://www.x402.org/) / [coinbase/x402](https://github.com/coinbase/x402).

---

## Roadmap (Condensed)

| Phase | Focus |
|-------|--------|
| **1** | Storacha + ElizaOS + `@storacha/elizaos-plugin`; agent DID, delegation, `.env`; verify upload/retrieve and CIDs. |
| **2** | Base Sepolia: RPC, test wallets, testnet ETH/USDC, Hardhat/Foundry, BaseScan. |
| **3** | ERC-8004: deploy & verify AgentIdentityRegistry, AgentReputationRegistry, AgentValidationRegistry; registry client + events. |
| **4** | x402: `@x402/core`, `@x402/evm`, `@x402/express`; payment middleware, 402 handler, signed payloads; testnet USDC; receipt storage on Storacha. |
| **5** | Plugins: `@rachax402/erc8004-plugin` (register, discover, update, reputation), `@rachax402/x402-plugin` (request, verify, settle). |
| **6** | Agents: Requester (discovery, trust, upload task, pay, verify result, feedback) vs Provider (ERC-8004 self-register, Express + x402, CSV/JSON/stats, Storacha results, reputation). |
| **7–9** | Agent cards, capability taxonomy, discovery; inter-agent protocol (CID-based); trust & validation (reputation, attestations, disputes). |
| **10–12** | Data pipeline (sharding, manifests, caching, GC); observability (logging, tracing, metrics, alerts); tests (unit, integration, contracts, payments, load). |
| **13–18** | CLI/SDK, optional dashboard, security harden, mainnet migration, economic design, ecosystem tooling. |

---

## Resources

- [Storacha + ElizaOS](https://docs.storacha.network/ai/elizaos/)
- [Base](https://docs.base.org/)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) · [polus-dev/erc-8004](https://github.com/polus-dev/erc-8004)
- [x402](https://www.x402.org/) · [coinbase/x402](https://github.com/coinbase/x402)

---

*Rachax402: discover, pay, verify—on-chain.*
