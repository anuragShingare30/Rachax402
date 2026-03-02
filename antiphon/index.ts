/**
 * Rachax402 — AgentA Lean Coordinator
 *
 * Express + EventEmitter pipeline that calls existing plugins(ERC-8004 and x402) directly.
 *
 * Port: TASK_API_PORT (default 3001)
 * Endpoints:
 *   POST /api/task               → { taskId }  (pipeline starts async)
 *   GET  /api/task/:taskId/stream → SSE events
 *   GET  /api/health             → { status, storacha, erc8004, x402 }
 */

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import * as Client from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import * as Proof from "@storacha/client/proof";
import { Signer } from "@storacha/client/principal/ed25519";
import dotenv from 'dotenv';
import {
  getERC8004Actions,
  resolveServiceRoute,
} from './plugins/erc8004/index.js';
import { getX402Actions } from './plugins/x402/index.js';

dotenv.config();

export type ActionHandlerCallback = (
  response: { text?: string }
) => Promise<unknown[]>;

export interface ActionHandlerState {
  recentMessagesData?: Array<{
    content?: { text?: string };
    createdAt: number;
  }>;
  data?: { [key: string]: unknown };
  [key: string]: unknown;
}

// ── SSE types ────────────────────────────────────────────────────────────────
interface StepEvent {
  stepNum: number;   // maps directly to analysisSteps/storageSteps id in store
  msg: string;       // human-readable message shown in terminal log
  liveLog: string[]; // full accumulated log up to this point
}

interface TaskResult {
  success: boolean;
  service: string;
  liveLog: string[];
  resultCID?: string;
  summary?: string;
  statistics?: Record<string, unknown>;
  insights?: string[];
  cid?: string;
  fileName?: string;
  fileSize?: number;
  reputationTxHash?: string;
  retrievedCID?: string;
  retrievedContentType?: string;
  retrievedDataBase64?: string;
}

interface ErrorResult {
  error: string;
  liveLog: string[];
}

// ── SSE Registry ─────────────────────────────────────────────────────────────
// Maps taskId → EventEmitter. POST creates the emitter, SSE subscriber attaches to it.
// Race-safe: GET /stream registers listeners before POST fires first event (it's async).
const taskStreams = new Map<string, EventEmitter>();

export async function initStoracha() {
  try {
    const pvtKey = process.env.STORACHA_AGENT_PRIVATE_KEY;
    if (!pvtKey) {
      throw new Error("STORACHA_AGENT_PRIVATE_KEY must be a non-empty string");
    }
    const principal = Signer.parse(pvtKey);
    const store = new StoreMemory();
    const client = await Client.create({ principal, store });

    const delegationKey = process.env.STORACHA_AGENT_DELEGATION;
    if (!delegationKey) {
      throw new Error("STORACHA_DELEGATION_KEY must be a non-empty string");
    }
    const proof = await Proof.parse(delegationKey);
    const space = await client.addSpace(proof);
    await client.setCurrentSpace(space.did());

    return client;
  } catch (error: any) {
    console.error("Error initializing Storacha client:", error);
    throw new Error("Failed to initialize Storacha client: " + error.message);
  }
}

function buildConfig() {
  const rpcUrl = process.env.BASE_RPC_URL ?? '';
  const privateKey = process.env.AGENT_A_PRIVATE_KEY ?? '';

  if (!rpcUrl || !privateKey) {
    console.warn('[AgentA] ⚠️  BASE_RPC_URL or AGENT_A_PRIVATE_KEY not set');
    return { erc8004: null, x402: null };
  }

  const erc8004 = {
    identityRegistryAddress: process.env.ERC8004_IDENTITY_REGISTRY ?? '',
    reputationRegistryAddress: process.env.ERC8004_REPUTATION_REGISTRY ?? '',
    rpcUrl,
    privateKey,
  };

  const x402 = process.env.X402_FACILITATOR_URL
    ? { facilitatorUrl: process.env.X402_FACILITATOR_URL, privateKey, rpcUrl }
    : null;

  return { erc8004, x402 };
}

async function main() {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  });

  app.use(express.json());
  app.use(
    cors({
      origin: '*',
      exposedHeaders: ['Content-Type'],
    })
  );

  // ── Initialize plugins ──────────────────────────────────────────────────
  const cfg = buildConfig();
  const erc8004Actions = getERC8004Actions(cfg.erc8004);
  const x402Actions = getX402Actions(cfg.x402);

  // ── Initialize Storacha ─────────────────────────────────────────────────
  let storacha: Awaited<ReturnType<typeof initStoracha>> | null = null;
  try {
    storacha = await initStoracha();
    console.log('[AgentA] ✅ Storacha Initialized');
  } catch (err) {
    console.error('[AgentA] ⚠️  Storacha init failed:', (err as Error).message);
    console.error(
      '[AgentA]    CSV analysis unavailable until STORACHA_AGENT_PRIVATE_KEY & STORACHA_AGENT_DELEGATION are valid'
    );
  }

  // ── SSE stream endpoint ─────────────────────────────────────────────────
  // Frontend opens this AFTER POST returns taskId.
  // Emitter may already exist (POST fired very fast) or be created here.
  app.get('/api/task/:taskId/stream', (req, res) => {
    const { taskId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Get or create emitter
    let emitter = taskStreams.get(taskId);
    if (!emitter) {
      emitter = new EventEmitter();
      taskStreams.set(taskId, emitter);
    }

    const onStep = (evt: StepEvent) => {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    };
    const onDone = (result: TaskResult) => {
      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
      cleanup();
    };
    const onError = (err: ErrorResult) => {
      res.write(`event: error\ndata: ${JSON.stringify(err)}\n\n`);
      cleanup();
    };

    const cleanup = () => {
      emitter!.off('step', onStep);
      emitter!.off('done', onDone);
      emitter!.off('error', onError);
      res.end();
    };

    emitter.on('step', onStep);
    emitter.on('done', onDone);
    emitter.on('error', onError);
    req.on('close', cleanup);
  });

  // ── Main task endpoint ──────────────────────────────────────────────────
  app.post(
    '/api/task',
    upload.single('file'),
    async (req: express.Request, res: express.Response) => {
      const taskId = randomUUID();
      const service = (req.body?.service as string) ?? 'analyze';
      const cidInput = req.body?.cid as string | undefined;
      const file = (req as express.Request & { file?: Express.Multer.File }).file;

      // Return taskId immediately — frontend opens SSE stream with it
      res.json({ taskId, success: true });

      // Create emitter now; SSE subscriber attaches to it
      const emitter = taskStreams.get(taskId) ?? new EventEmitter();
      taskStreams.set(taskId, emitter);

      const liveLog: string[] = [];
      let currentStep = 1;

      // Emit a step event to SSE + console
      const emit = (stepNum: number, msg: string) => {
        currentStep = stepNum;
        liveLog.push(msg);
        const evt: StepEvent = { stepNum, msg, liveLog: [...liveLog] };
        emitter.emit('step', evt);
        console.log(`[AgentA:${stepNum}] ${msg}`);
      };

      // Adapter: plugin callbacks call this
      const callback: ActionHandlerCallback = async (response) => {
        if (response.text) emit(currentStep, response.text);
        return [];
      };

      try {
        // Build state object — replaces ElizaOS ActionHandlerState
        const state: ActionHandlerState = {
          data: { serviceIntent: service },
          recentMessagesData: [
            { content: { text: service }, createdAt: Date.now() },
          ],
        };

        // ── 1 → 2: AGENT_DISCOVER ───────────────────────────────────────
        currentStep = 2;
        emit(2, `🔍 Querying ERC-8004 registry for "${service}" capability...`);
        await erc8004Actions.AGENT_DISCOVER.handler(
          null,
          null,
          state,
          {},
          callback
        );

        if (!state.data?.providerEndpoint) {
          throw new Error(
            `No provider found on-chain for service: ${service}. ` +
              'Ensure AgentB is registered via register-services.js'
          );
        }

        // ── 2: Upload / Prepare payload ──────────────────────────────────
        const route = resolveServiceRoute(service);

        if (route.capability === 'csv-analysis') {
          // CSV analysis: upload to Storacha for FREE (data transport only)
          // No x402, no wallet, no user interaction. AgentA's Storacha creds.
          if (!file) throw new Error('CSV file required for analysis');
          if (!storacha)
            throw new Error(
              'Storacha unavailable — check STORACHA_AGENT_PRIVATE_KEY and STORACHA_AGENT_DELEGATION'
            );

          emit(2, `📤 Uploading CSV to Storacha (free data transport, no payment)...`);
          const csvFile = new File([file.buffer], file.originalname, {
            type: file.mimetype,
          });
          const cid = await storacha.uploadFile(csvFile);
          const cidStr = cid.toString();
          state.data!.inputCID = cidStr;
          emit(2, `✅ CSV staged — inputCID: ${cidStr.slice(0, 20)}...`);
        } else if (route.endpointSuffix === '/upload') {
          // File storage: pass raw buffer to x402 plugin which sends it as multipart
          if (!file) throw new Error('File required for storage service');
          emit(2, `📦 Preparing file "${file.originalname}" for paid IPFS storage...`);
          const ab = file.buffer.buffer.slice(
            file.buffer.byteOffset,
            file.buffer.byteOffset + file.buffer.byteLength
          );
          state.data!.fileBuffer = ab;
          state.data!.fileName = file.originalname;
          state.data!.fileMimeType = file.mimetype;
        } else {
          // File retrieval: just pass the CID
          if (!cidInput) throw new Error('CID required for file retrieval');
          emit(2, `🔎 Preparing retrieval request for CID: ${cidInput}...`);
          state.data!.retrieveCID = cidInput;
        }

        // ── 3: PAYMENT_REQUEST — x402 EIP-712 auto-sign + execute ────────
        currentStep = 3;
        emit(
          3,
          `💳 AgentA sending x402 payment → ${state.data!.providerEndpoint}`
        );
        await x402Actions.PAYMENT_REQUEST.handler(null, null, state, {}, callback);

        const hasResult =
          state.data?.resultCID ||
          state.data?.storageResults ||
          state.data?.retrievedData;

        if (!hasResult) {
          throw new Error(
            'Task execution failed — AgentB returned no result. Check AgentB server logs.'
          );
        }

        // ── 4: Processing complete ────────────────────────────────────────
        currentStep = 4;
        emit(4, `✅ Payment confirmed, service delivered by AgentB`);

        // ── 4 / 5: REPUTATION_POST ────────────────────────────────────────
        const repStep = route.capability === 'csv-analysis' ? 5 : 3;
        currentStep = repStep;
        emit(repStep, `⭐ Posting on-chain reputation for ${state.data!.providerWallet}...`);
        await erc8004Actions.REPUTATION_POST.handler(null, null, state, {}, callback);

        // ── 5 / 6: Done ───────────────────────────────────────────────────
        const doneStep = route.capability === 'csv-analysis' ? 6 : 4;
        emit(doneStep, `🏆 Pipeline complete — all steps done`);

        // Build final result object
        const result: TaskResult = {
          success: true,
          service,
          liveLog: [...liveLog],
          reputationTxHash: state.data?.reputationTxHash as string,
        };

        if (state.data?.analysisResults) {
          const ar = state.data.analysisResults as {
            summary: string;
            statistics: Record<string, unknown>;
            insights: string[];
            resultCID: string;
          };
          result.resultCID = ar.resultCID;
          result.summary = ar.summary;
          result.statistics = ar.statistics;
          result.insights = ar.insights;
        } else if (state.data?.storageResults) {
          const sr = state.data.storageResults as {
            cid: string;
            fileName: string;
            fileSize: number;
          };
          result.cid = sr.cid;
          result.fileName = sr.fileName;
          result.fileSize = sr.fileSize;
        } else if (state.data?.retrievedData) {
          const buf = state.data.retrievedData as ArrayBuffer;
          result.retrievedCID = state.data.retrievedCID as string;
          result.retrievedContentType = state.data
            .retrievedContentType as string;
          result.retrievedDataBase64 = Buffer.from(buf).toString('base64');
        } else if (state.data?.resultCID) {
          result.resultCID = state.data.resultCID as string;
        }

        emitter.emit('done', result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[AgentA] ❌ Task failed:', err);
        liveLog.push(`❌ ${msg}`);
        const event: ErrorResult = { error: msg, liveLog: [...liveLog] };
        emitter.emit('error', event);
      } finally {
        // Clean up after SSE has drained
        setTimeout(() => {
          taskStreams.delete(taskId);
        }, 8000);
      }
    }
  );

  // ── Health check ────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      agent: 'RachaxCoordinator',
      framework: 'lean-ts',
      storacha: !!storacha,
      erc8004: !!cfg.erc8004?.identityRegistryAddress,
      x402: !!cfg.x402,
      agentBEndpoints: {
        analyzer: 'http://localhost:8001/analyze',
        storage: 'http://localhost:8000/upload',
        retrieval: 'http://localhost:8000/retrieve',
      },
    });
  });

  const port = parseInt(process.env.TASK_API_PORT ?? '3001', 10);
  app.listen(port, () => {
    console.log(`\n🤖 Rachax402 AgentA Coordinator`);
    console.log(`   POST  http://localhost:${port}/api/task`);
    console.log(`   GET   http://localhost:${port}/api/task/:id/stream  (SSE)`);
    console.log(`   GET   http://localhost:${port}/api/health\n`);
  });
}

main().catch((err) => {
  console.error('[AgentA] Fatal startup error:', err);
  process.exit(1);
});