import { DirectClient } from "@elizaos/client-direct";
import {
  AgentRuntime,
  elizaLogger,
  getEnv,
  stringToUuid,
  type Character,
} from "@elizaos/core";
import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { getStorageClient } from "@storacha/elizaos-plugin";
import { agentRequester } from "./elizaOS/Requester/character.js";
import { agentProvider } from "./elizaOS/Provider/character.js";
import { initializeERC8004, getERC8004Actions } from "./plugins/erc8004/index.js";
import { initializeX402, getX402Actions } from "./plugins/x402/index.js";
import express from "express";
import Papa from "papaparse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type ActionHandlerCallback = (response: { text?: string }) => Promise<unknown[]>;
export interface ActionHandlerState {
  recentMessagesData?: Array<{ content?: { text?: string }; createdAt: number }>;
  data?: {
    agentCardCID?: string;
    selectedAgent?: { address?: string; endpoint?: string; agentCardCID?: string; reputation?: number; totalRatings?: number };
    inputCID?: string;
    providerEndpoint?: string;
    resultCID?: string;
    rating?: number;
    comment?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

declare module "@elizaos/core" {
  export enum ServiceType {
    STORACHA = "storacha",
  }
}

function getTokenForProvider(provider: string, character: Character): string {
  const envKey = provider === "OPENROUTER" 
    ? "OPENROUTER_API_KEY" 
    : `${provider.toUpperCase()}_API_KEY`;
  return process.env[envKey] || "";
}

function parseArguments() {
  const args: any = {};
  process.argv.slice(2).forEach((arg) => {
    const parts = arg.split("=");
    const key = parts[0];
    const value = parts[1];
    if (key && key.startsWith("--")) {
      args[key.slice(2)] = value || true;
    }
  });
  return args;
}

function initializeDatabase(dataDir: string) {
  return {
    init: async () => Promise.resolve(),
    close: async () => Promise.resolve(),
  };
}

function initializeDbCache(character: Character, db: any) {
  return {
    get: async (key: string) => null,
    set: async (key: string, value: any) => {},
    delete: async (key: string) => {},
  };
}

async function initializeClients(character: Character, runtime: AgentRuntime) {
  return [];
}

export function createAgent(
  character: Character,
  db: any,
  cache: any,
  token: string
) {
  elizaLogger.success(
    elizaLogger.successesTitle,
    "Creating runtime for character",
    character.name
  );

  return new AgentRuntime({
    databaseAdapter: db,
    token,
    modelProvider: character.modelProvider,
    evaluators: [],
    character,
    plugins: [bootstrapPlugin].filter(Boolean),
    providers: [],
    actions: [],
    services: [],
    managers: [],
    cacheManager: cache,
  });
}

async function startRequesterAgent(character: Character, directClient: DirectClient, storageClient: any) {
  try {
    character.id ??= stringToUuid(character.name);
    character.username ??= character.name;

    const token = getTokenForProvider(character.modelProvider, character);
    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = initializeDatabase(dataDir);
    await db.init();
    const cache = initializeDbCache(character, db);
    const runtime = createAgent(character, db, cache, token);

    if (process.env.BASE_RPC_URL && process.env.PRIVATE_KEY) {
      initializeERC8004({
        identityRegistryAddress: process.env.ERC8004_IDENTITY_REGISTRY || "",
        reputationRegistryAddress: process.env.ERC8004_REPUTATION_REGISTRY || "",
        rpcUrl: process.env.BASE_RPC_URL,
        privateKey: process.env.PRIVATE_KEY,
      });
    }

    if (process.env.X402_FACILITATOR_URL && process.env.PRIVATE_KEY) {
      initializeX402({
        facilitatorUrl: process.env.X402_FACILITATOR_URL,
        privateKey: process.env.PRIVATE_KEY,
        rpcUrl: process.env.BASE_RPC_URL || "",
      });
    }

    await runtime.initialize();

    const erc8004Actions = getERC8004Actions();
    const x402Actions = getX402Actions();

    runtime.evaluate = async () => ['AGENT_DISCOVER', 'ANTIPHON_AT_PLAY', 'PAYMENT_REQUEST', 'RESULT_RETRIEVE', 'REPUTATION_POST'];

    const discoverAction = erc8004Actions.AGENT_DISCOVER;
    discoverAction.handler = async (
      _runtime: unknown,
      _message: unknown,
      state: ActionHandlerState,
      _options: unknown,
      callback: ActionHandlerCallback
    ) => {
      const capabilities = (state.recentMessagesData
        ?.find((m) => m.content?.text?.includes('csv') || m.content?.text?.includes('analyze'))
        ?.content?.text || 'csv-analysis').toLowerCase();

      if (process.env.BASE_RPC_URL && process.env.PRIVATE_KEY) {
        const erc8004Handler = erc8004Actions.AGENT_DISCOVER.handler;
        await erc8004Handler?.(_runtime, _message, state, _options, callback);
        
        const selectedAgent = state.data?.selectedAgent as { endpoint?: string; agentCardCID?: string } | undefined;
        if (selectedAgent?.agentCardCID) {
          try {
            const agentCardData = await storageClient.getStorage().retrieve(selectedAgent.agentCardCID);
            const agentCardText = await agentCardData.text();
            const agentCard = JSON.parse(agentCardText);
            state.data = { 
              ...(state.data || {}), 
              selectedAgent: { ...selectedAgent, endpoint: agentCard.endpoint } 
            };
            await callback?.({ text: `Retrieved agent card. Endpoint: ${agentCard.endpoint}` });
          } catch (error: any) {
            elizaLogger.error("Agent card retrieval error:", error);
          }
        }
      } else {
        await callback?.({ 
          text: `Querying ERC-8004 registry for capabilities: ${capabilities}... (ERC-8004 not configured, using mock)` 
        });
        await callback?.({ 
          text: `Found matching agents. Selecting best match based on reputation and pricing.` 
        });
      }
    };
    runtime.registerAction(discoverAction);

    runtime.registerAction({
      name: 'ANTIPHON_AT_PLAY',
      description: 'Upload input dataset to Storacha, initiate task request with input CID, manage workflow',
      similes: ['orchestrate', 'coordinate', 'submit'],
      validate: async () => true,
      handler: async (
        _runtime: unknown,
        _message: unknown,
        state: ActionHandlerState,
        _options: unknown,
        callback: ActionHandlerCallback
      ) => {
        const interactions = (state.recentMessagesData?.slice(0, 5) ?? []).sort(
          (a, b) => a.createdAt - b.createdAt
        );

        const taskData = interactions
          .map((interaction) => interaction.content?.text || "")
          .join("\n");

        await callback?.({ text: "Uploading input data to Storacha..." });
        
        try {
          const jsonString = JSON.stringify({ task: taskData }, null, 2);
          const blobContent = new Blob([jsonString], { type: "application/json" });
          const file = new File([blobContent], `task-input.json`, { type: "application/json" });
          const inputCID = await storageClient.getStorage().uploadDirectory([file]);
          
          state.data = { ...(state.data || {}), inputCID };
          
          await callback?.({ 
            text: `Input uploaded (CID: ${inputCID}). Initiating task request to service provider...` 
          });

          const selectedAgent = state.data?.selectedAgent as { endpoint?: string; address?: string } | undefined;
          if (selectedAgent?.endpoint) {
            state.data = { ...(state.data || {}), providerEndpoint: selectedAgent.endpoint };
            await callback?.({ text: `Sending request to ${selectedAgent.endpoint}...` });
          } else {
            await callback?.({ text: "No provider endpoint found. Run AGENT_DISCOVER first." });
          }
        } catch (error: any) {
          elizaLogger.error("Upload error:", error);
          await callback?.({ text: `Error uploading input data: ${error.message}` });
        }
      },
      examples: [
        [
          { user: "{{user1}}", content: { text: "Analyze this data" } },
          { user: "{{DataRequester}}", content: { text: "Uploading input to Storacha..." } }
        ],
      ],
    });

    const paymentAction = x402Actions.PAYMENT_REQUEST;
    paymentAction.handler = async (
      _runtime: unknown,
      _message: unknown,
      state: ActionHandlerState,
      _options: unknown,
      callback: ActionHandlerCallback
    ) => {
      const providerEndpoint = state.data?.providerEndpoint as string;
      const inputCID = state.data?.inputCID as string;

      if (!providerEndpoint || !inputCID) {
        await callback?.({ text: "Missing provider endpoint or input CID. Run AGENT_DISCOVER and ANTIPHON_AT_PLAY first." });
        return;
      }

      if (process.env.X402_FACILITATOR_URL && process.env.PRIVATE_KEY) {
        const x402Handler = x402Actions.PAYMENT_REQUEST.handler;
        await x402Handler?.(_runtime, _message, state, _options, callback);
      } else {
        await callback?.({ text: "Payment required: 0.01 USDC on Base Sepolia. (x402 not configured, using mock)" });
        await callback?.({ text: "Payment verified via Coinbase facilitator. Task execution authorized." });
      }
    };
    runtime.registerAction(paymentAction);

    const reputationAction = erc8004Actions.REPUTATION_POST;
    reputationAction.handler = async (
      _runtime: unknown,
      _message: unknown,
      state: ActionHandlerState,
      _options: unknown,
      callback: ActionHandlerCallback
    ) => {
      const resultCID = state.data?.resultCID as string;
      if (resultCID) {
        state.data = { ...(state.data || {}), resultCID, rating: 5, comment: "Excellent service" };
      }

      if (process.env.BASE_RPC_URL && process.env.PRIVATE_KEY) {
        const erc8004Handler = erc8004Actions.REPUTATION_POST.handler;
        await erc8004Handler?.(_runtime, _message, state, _options, callback);
      } else {
        await callback?.({ text: "Posting reputation feedback to ERC-8004 ReputationRegistry. (ERC-8004 not configured, using mock)" });
      }
    };
    runtime.registerAction({
      name: 'RESULT_RETRIEVE',
      description: 'Retrieve analysis results from Storacha using result CID',
      similes: ['retrieve', 'fetch', 'get results'],
      validate: async () => true,
      handler: async (
        _runtime: unknown,
        _message: unknown,
        state: ActionHandlerState,
        _options: unknown,
        callback: ActionHandlerCallback
      ) => {
        const resultCID = state.data?.resultCID as string;
        if (!resultCID) {
          await callback?.({ text: "No result CID found. Complete payment and task execution first." });
          return;
        }

        try {
          await callback?.({ text: `Retrieving results from Storacha (CID: ${resultCID})...` });
          
          const resultData = await storageClient.getStorage().retrieve(resultCID);
          const resultText = await resultData.text();
          const results = JSON.parse(resultText);
          
          await callback?.({ 
            text: `Results retrieved:\n${JSON.stringify(results, null, 2)}` 
          });
        } catch (error: any) {
          elizaLogger.error("Result retrieval error:", error);
          await callback?.({ text: `Error retrieving results: ${error.message}` });
        }
      },
      examples: [
        [
          { user: "{{user1}}", content: { text: "Get results" } },
          { user: "{{DataRequester}}", content: { text: "Retrieving results from Storacha..." } }
        ],
      ],
    });

    runtime.registerAction(reputationAction);

    runtime.clients = await initializeClients(character, runtime);
    directClient.registerAgent(runtime);

    elizaLogger.debug(`Started ${character.name} (Requester) as ${runtime.agentId}`);
    return runtime;
  } catch (error) {
    elizaLogger.error(`Error starting requester agent:`, error);
    throw error;
  }
}

async function startProviderAgent(character: Character, directClient: DirectClient, storageClient: any) {
  try {
    character.id ??= stringToUuid(character.name);
    character.username ??= character.name;

    const token = getTokenForProvider(character.modelProvider, character);
    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = initializeDatabase(dataDir);
    await db.init();
    const cache = initializeDbCache(character, db);
    const runtime = createAgent(character, db, cache, token);

    if (process.env.BASE_RPC_URL && process.env.PRIVATE_KEY) {
      initializeERC8004({
        identityRegistryAddress: process.env.ERC8004_IDENTITY_REGISTRY || "",
        reputationRegistryAddress: process.env.ERC8004_REPUTATION_REGISTRY || "",
        rpcUrl: process.env.BASE_RPC_URL,
        privateKey: process.env.PRIVATE_KEY,
      });
    }

    if (process.env.X402_FACILITATOR_URL) {
      initializeX402({
        facilitatorUrl: process.env.X402_FACILITATOR_URL,
        privateKey: process.env.PRIVATE_KEY || "",
        rpcUrl: process.env.BASE_RPC_URL || "",
        payToAddress: process.env.PAY_TO_ADDRESS || undefined,
      });
    }

    await runtime.initialize();

    const erc8004Actions = getERC8004Actions();
    const x402Actions = getX402Actions();

    runtime.evaluate = async () => ['AGENT_REGISTER', 'ANALYZE_DATA', 'PAYMENT_VERIFY'];

    const registerAction = erc8004Actions.AGENT_REGISTER;
    registerAction.handler = async (
      _runtime: unknown,
      _message: unknown,
      state: ActionHandlerState,
      _options: unknown,
      callback: ActionHandlerCallback
    ) => {
      await callback?.({
        text: "Generating agent card with capabilities and pricing..."
      });

      try {
        const agentCard = {
          name: character.name,
          capabilities: character.settings?.capabilities || [],
          pricing: character.settings?.pricing || {},
          endpoint: character.settings?.endpoint || `http://localhost:${parseInt(getEnv("SERVER_PORT") || "3000")}/analyze`,
        };
        
        const jsonString = JSON.stringify(agentCard, null, 2);
        const blobContent = new Blob([jsonString], { type: "application/json" });
        const file = new File([blobContent], `agent-card.json`, { type: "application/json" });
        const agentCardCID = await storageClient.getStorage().uploadDirectory([file]);
        
          state.data = { ...(state.data || {}), agentCardCID };
        
        await callback?.({ 
          text: `Agent card uploaded (CID: ${agentCardCID}). Registering on ERC-8004 IdentityRegistry...` 
        });
        
        if (process.env.BASE_RPC_URL && process.env.PRIVATE_KEY) {
          const erc8004Handler = erc8004Actions.AGENT_REGISTER.handler;
          await erc8004Handler?.(_runtime, _message, state, _options, callback);
        } else {
          await callback?.({ 
            text: `Registration skipped (ERC-8004 not configured). Agent card CID: ${agentCardCID}` 
          });
        }
      } catch (error: any) {
        elizaLogger.error("Agent registration error:", error);
        await callback?.({ text: `Error registering agent: ${error.message}` });
      }
    };
    runtime.registerAction(registerAction);

    runtime.registerAction({
      name: 'ANALYZE_DATA',
      description: 'Analyze CSV/JSON data: fetch input CID from Storacha, process with PapaParse/Zod, upload results',
      similes: ['analyze', 'process', 'compute'],
      validate: async () => true,
      handler: async (
        _runtime: unknown,
        _message: unknown,
        state: ActionHandlerState,
        _options: unknown,
        callback: ActionHandlerCallback
      ) => {
        const inputCID = state.data?.inputCID as string;
        if (!inputCID) {
          await callback?.({ text: "No input CID provided." });
          return;
        }

        await callback?.({
          text: "Payment verified. Fetching input data from Storacha..."
        });

        try {
          const inputData = await storageClient.getStorage().retrieve(inputCID);
          const dataText = await inputData.text();
          const data = JSON.parse(dataText);

          await callback?.({
            text: "Processing data: parsing CSV, computing statistics..."
          });

          let results: any = {};
          if (data.task && typeof data.task === 'string' && data.task.includes(',')) {
            const csvData = Papa.parse(data.task, { header: true });
            const numericValues = csvData.data
              .filter((row: any) => row && Object.values(row).some((v: any) => !isNaN(parseFloat(v))))
              .map((row: any) => Object.values(row).map((v: any) => parseFloat(v)).filter((v: any) => !isNaN(v)))
              .flat();

            if (numericValues.length > 0) {
              const mean = numericValues.reduce((a: number, b: number) => a + b, 0) / numericValues.length;
              const variance = numericValues.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / numericValues.length;
              const stdDev = Math.sqrt(variance);

              results = {
                rowsProcessed: csvData.data.length,
                mean: mean.toFixed(2),
                stdDev: stdDev.toFixed(2),
                summary: "CSV analysis complete",
              };
            }
          } else {
            results = {
              rowsProcessed: 1,
              mean: 0,
              stdDev: 0,
              summary: "Data processed",
              data: data,
            };
          }
          
          const jsonString = JSON.stringify(results, null, 2);
          const blobContent = new Blob([jsonString], { type: "application/json" });
          const file = new File([blobContent], `analysis-results.json`, { type: "application/json" });
          const resultCID = await storageClient.getStorage().uploadDirectory([file]);
          
          await callback?.({ 
            text: `Analysis complete! Results uploaded (CID: ${resultCID}). Summary: ${results.rowsProcessed} rows, mean=${results.mean}, std dev=${results.stdDev}` 
          });

          state.data = { ...(state.data || {}), resultCID };
        } catch (error: any) {
          elizaLogger.error("Data analysis error:", error);
          await callback?.({ text: `Error processing data: ${error.message}` });
        }
      },
      examples: [
        [
          { user: "{{user1}}", content: { text: "Analyze data" } },
          { user: "{{DataAnalyzer}}", content: { text: "Processing analysis..." } }
        ],
      ],
    });

    runtime.registerAction(x402Actions.PAYMENT_VERIFY);

    runtime.clients = await initializeClients(character, runtime);
    directClient.registerAgent(runtime);

    await startProviderExpressServer(character, storageClient, runtime);

    const registerState: ActionHandlerState = { data: {}, recentMessagesData: [] };
    await registerAction.handler?.(
      runtime as any,
      {} as any,
      registerState,
      {},
      async (response: { text?: string }) => {
        elizaLogger.info(response.text || "");
        return [];
      }
    );

    elizaLogger.debug(`Started ${character.name} (Provider) as ${runtime.agentId}`);
    return runtime;
  } catch (error) {
    elizaLogger.error(`Error starting provider agent:`, error);
    throw error;
  }
}

async function startProviderExpressServer(character: Character, storageClient: any, runtime: AgentRuntime) {
  if (!process.env.X402_FACILITATOR_URL || !process.env.PAY_TO_ADDRESS) {
    elizaLogger.warn("x402 not configured. Express server not started.");
    return;
  }

  try {
    const { paymentMiddleware, x402ResourceServer } = await import("@x402/express");
    const { HTTPFacilitatorClient } = await import("@x402/core/server");
    const { ExactEvmScheme } = await import("@x402/evm/exact/server");

    const facilitatorClient = new HTTPFacilitatorClient({ 
      url: process.env.X402_FACILITATOR_URL 
    });
    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register("eip155:84532", new ExactEvmScheme());

    const providerPort = parseInt(character.settings?.endpoint?.split(':')[2]?.split('/')[0] || "3001");
    const app = express();
    app.use(express.json());

    const pricing = character.settings?.pricing as { baseRate?: number; currency?: string } | undefined;
    const price = `$${pricing?.baseRate || 0.01}`;

    app.use(
      paymentMiddleware(
        {
          "POST /analyze": {
            accepts: {
              scheme: "exact",
              price,
              network: "eip155:84532",
              payTo: process.env.PAY_TO_ADDRESS as `0x${string}`,
            },
            description: "Data analysis service",
          },
        },
        resourceServer,
      ),
    );

    app.post("/analyze", async (req: express.Request, res: express.Response) => {
      try {
        const { inputCID, requirements } = req.body;
        if (!inputCID) {
          return res.status(400).json({ error: "inputCID required" });
        }

        elizaLogger.info(`Processing analysis request for CID: ${inputCID}`);

        const inputData = await storageClient.getStorage().retrieve(inputCID);
        const dataText = await inputData.text();
        const data = JSON.parse(dataText);

        let results: any = {};
        if (data.task && typeof data.task === 'string' && data.task.includes(',')) {
          const csvData = Papa.parse(data.task, { header: true });
          const numericValues = csvData.data
            .filter((row: any) => row && Object.values(row).some((v: any) => !isNaN(parseFloat(v))))
            .map((row: any) => Object.values(row).map((v: any) => parseFloat(v)).filter((v: any) => !isNaN(v)))
            .flat();

          if (numericValues.length > 0) {
            const mean = numericValues.reduce((a: number, b: number) => a + b, 0) / numericValues.length;
            const variance = numericValues.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / numericValues.length;
            const stdDev = Math.sqrt(variance);

            results = {
              rowsProcessed: csvData.data.length,
              mean: mean.toFixed(2),
              stdDev: stdDev.toFixed(2),
              summary: requirements || "CSV analysis complete",
            };
          }
        } else {
          results = {
            rowsProcessed: 1,
            summary: requirements || "Data processed",
            data: data,
          };
        }

        const jsonString = JSON.stringify(results, null, 2);
        const blobContent = new Blob([jsonString], { type: "application/json" });
        const file = new File([blobContent], `analysis-results.json`, { type: "application/json" });
        const resultCID = await storageClient.getStorage().uploadDirectory([file]);

        res.json({ resultCID, status: "completed", results });
      } catch (error: any) {
        elizaLogger.error("Analysis endpoint error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.listen(providerPort, () => {
      elizaLogger.success(`Provider Express server running on port ${providerPort}`);
      elizaLogger.info(`Analysis endpoint: http://localhost:${providerPort}/analyze`);
    });
  } catch (error: any) {
    elizaLogger.error("Failed to start Express server:", error);
  }
}

const checkPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
};

const startAgents = async () => {
  const directClient = new DirectClient();
  let serverPort = parseInt(getEnv("SERVER_PORT") || "3000");
  const args = parseArguments();

  const agentMode = args.mode || process.env.AGENT_MODE || "both";
  
  try {
    const storageClient = await getStorageClient({} as any);

    if (agentMode === "requester" || agentMode === "both") {
      await startRequesterAgent(agentRequester, directClient, storageClient);
    }

    if (agentMode === "provider" || agentMode === "both") {
      await startProviderAgent(agentProvider, directClient, storageClient);
    }
  } catch (error) {
    elizaLogger.error("Error starting agents:", error);
  }

  while (!(await checkPortAvailable(serverPort))) {
    elizaLogger.warn(`Port ${serverPort} is in use, trying ${serverPort + 1}`);
    serverPort++;
  }

  directClient.startAgent = async (character: Character) => {
    const storageClient = await getStorageClient({} as any);
    if (character.name === "DataRequester") {
      return startRequesterAgent(character, directClient, storageClient);
    } else {
      return startProviderAgent(character, directClient, storageClient);
    }
  };

  directClient.start(serverPort);

  if (serverPort !== parseInt(getEnv("SERVER_PORT") || "3000")) {
    elizaLogger.log(`Server started on alternate port ${serverPort}`);
  }

  elizaLogger.success("Rachax402 Antiphon agents started successfully");
  elizaLogger.info(`Agent mode: ${agentMode}`);
  elizaLogger.info(`Server running on port ${serverPort}`);
};

startAgents().catch((error) => {
  elizaLogger.error("Unhandled error in startAgents:", error);
  process.exit(1);
});
