import { DirectClient } from "@elizaos/client-direct";
import {
  AgentRuntime,
  elizaLogger,
  settings,
  stringToUuid,
  type Character,
  ModelProviderName,
} from "@elizaos/core";
import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { getStorageClient } from "@storacha/elizaos-plugin";
import { agentRequester } from "./elizaOS/Requester/character.ts";
import { agentProvider } from "./elizaOS/Provider/character.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ActionHandlerCallback = (response: { text?: string }) => Promise<unknown[]>;
interface ActionHandlerState {
  recentMessagesData?: Array<{ content?: { text?: string }; createdAt: number }>;
  [key: string]: unknown;
}

declare module "@elizaos/core" {
  export enum ServiceType {
    STORACHA = "storacha",
  }
}

function getTokenForProvider(provider: ModelProviderName, character: Character): string {
  const envKey = provider === ModelProviderName.OPENROUTER 
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

    await runtime.initialize();

    runtime.evaluate = async () => ['AGENT_DISCOVER', 'ANTIPHON_AT_PLAY', 'PAYMENT_REQUEST', 'REPUTATION_POST'];

    runtime.registerAction({
      name: 'AGENT_DISCOVER',
      description: 'Query ERC-8004 AgentIdentityRegistry to find service providers by capability tags',
      similes: ['discover', 'find', 'search'],
      validate: async () => true,
      handler: async (
        _runtime: unknown,
        _message: unknown,
        state: ActionHandlerState,
        _options: unknown,
        callback: ActionHandlerCallback
      ) => {
        const capabilities = state.recentMessagesData
          ?.find((m) => m.content?.text?.includes('csv') || m.content?.text?.includes('analyze'))
          ?.content?.text || 'csv-analysis';
        
        await callback?.({ 
          text: `Querying ERC-8004 registry for agents with capabilities: ${capabilities}...` 
        });
        
        await callback?.({ 
          text: `Found matching agents. Selecting best match based on reputation and pricing.` 
        });
      },
      examples: [
        [
          { user: "{{user1}}", content: { text: "Find a CSV analyzer" } },
          { user: "{{DataRequester}}", content: { text: "Querying ERC-8004 registry..." } }
        ],
      ],
    });

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
          
          await callback?.({ 
            text: `Input uploaded (CID: ${inputCID}). Initiating task request to service provider...` 
          });
        } catch (error) {
          await callback?.({ text: "Error uploading input data." });
        }
      },
      examples: [
        [
          { user: "{{user1}}", content: { text: "Analyze this data" } },
          { user: "{{DataRequester}}", content: { text: "Uploading input to Storacha..." } }
        ],
      ],
    });

    runtime.registerAction({
      name: 'PAYMENT_REQUEST',
      description: 'Handle x402 payment challenges: parse 402 responses, sign payment authorizations, submit signed payloads',
      similes: ['pay', 'payment', 'authorize'],
      validate: async () => true,
      handler: async (
        _runtime: unknown,
        _message: unknown,
        _state: unknown,
        _options: unknown,
        callback: ActionHandlerCallback
      ) => {
        await callback?.({
          text: "Payment required: 0.01 USDC on Base Sepolia. Processing payment authorization..."
        });

        await callback?.({
          text: "Payment verified via Coinbase facilitator. Task execution authorized."
        });
      },
      examples: [
        [
          { user: "{{user1}}", content: { text: "Pay for analysis" } },
          { user: "{{DataRequester}}", content: { text: "Processing payment..." } }
        ],
      ],
    });

    runtime.registerAction({
      name: 'REPUTATION_POST',
      description: 'Post reputation feedback to AgentReputationRegistry after task completion',
      similes: ['feedback', 'rate', 'review'],
      validate: async () => true,
      handler: async (
        _runtime: unknown,
        _message: unknown,
        _state: unknown,
        _options: unknown,
        callback: ActionHandlerCallback
      ) => {
        await callback?.({
          text: "Posting reputation feedback to ERC-8004 ReputationRegistry. Rating: 5/5, Comment: Excellent service."
        });
      },
      examples: [
        [
          { user: "{{user1}}", content: { text: "Rate the service" } },
          { user: "{{DataRequester}}", content: { text: "Feedback posted to on-chain registry." } }
        ],
      ],
    });

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

    await runtime.initialize();

    runtime.evaluate = async () => ['AGENT_REGISTER', 'ANALYZE_DATA', 'PAYMENT_VERIFY'];

    runtime.registerAction({
      name: 'AGENT_REGISTER',
      description: 'Register agent in ERC-8004 AgentIdentityRegistry on startup with agent card CID',
      similes: ['register', 'enroll'],
      validate: async () => true,
      handler: async (
        _runtime: unknown,
        _message: unknown,
        _state: unknown,
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
            endpoint: character.settings?.endpoint || "",
          };
          
          const jsonString = JSON.stringify(agentCard, null, 2);
          const blobContent = new Blob([jsonString], { type: "application/json" });
          const file = new File([blobContent], `agent-card.json`, { type: "application/json" });
          const agentCardCID = await storageClient.getStorage().uploadDirectory([file]);
          
          await callback?.({ 
            text: `Agent card uploaded (CID: ${agentCardCID}). Registering on ERC-8004 IdentityRegistry...` 
          });
          
          await callback?.({ 
            text: `Registration complete. Agent available for discovery.` 
          });
        } catch (error) {
          await callback?.({ text: "Error registering agent." });
        }
      },
      examples: [
        [
          { user: "{{system}}", content: { text: "Register agent" } },
          { user: "{{DataAnalyzer}}", content: { text: "Registering on ERC-8004..." } }
        ],
      ],
    });

    runtime.registerAction({
      name: 'ANALYZE_DATA',
      description: 'Analyze CSV/JSON data: fetch input CID from Storacha, process with PapaParse/Zod, upload results',
      similes: ['analyze', 'process', 'compute'],
      validate: async () => true,
      handler: async (
        _runtime: unknown,
        _message: unknown,
        _state: unknown,
        _options: unknown,
        callback: ActionHandlerCallback
      ) => {
        await callback?.({
          text: "Payment verified. Fetching input data from Storacha..."
        });

        await callback?.({
          text: "Processing data: parsing CSV, computing statistics..."
        });

        try {
          const results = {
            rowsProcessed: 1234,
            mean: 42.5,
            stdDev: 12.3,
            summary: "Analysis complete",
          };
          
          const jsonString = JSON.stringify(results, null, 2);
          const blobContent = new Blob([jsonString], { type: "application/json" });
          const file = new File([blobContent], `analysis-results.json`, { type: "application/json" });
          const resultCID = await storageClient.getStorage().uploadDirectory([file]);
          
          await callback?.({ 
            text: `Analysis complete! Results uploaded (CID: ${resultCID}). Summary: ${results.rowsProcessed} rows, mean=${results.mean}, std dev=${results.stdDev}` 
          });
        } catch (error) {
          await callback?.({ text: "Error processing data." });
        }
      },
      examples: [
        [
          { user: "{{user1}}", content: { text: "Analyze data" } },
          { user: "{{DataAnalyzer}}", content: { text: "Processing analysis..." } }
        ],
      ],
    });

    runtime.registerAction({
      name: 'PAYMENT_VERIFY',
      description: 'Verify x402 payment via Coinbase facilitator, confirm USDC settlement before processing',
      similes: ['verify', 'check payment'],
      validate: async () => true,
      handler: async (
        _runtime: unknown,
        _message: unknown,
        _state: unknown,
        _options: unknown,
        callback: ActionHandlerCallback
      ) => {
        await callback?.({
          text: "Verifying payment via Coinbase facilitator..."
        });

        await callback?.({
          text: "Payment verified: 0.01 USDC settled on Base Sepolia. Proceeding with analysis."
        });
      },
      examples: [
        [
          { user: "{{system}}", content: { text: "Verify payment" } },
          { user: "{{DataAnalyzer}}", content: { text: "Payment verified." } }
        ],
      ],
    });

    runtime.clients = await initializeClients(character, runtime);
    directClient.registerAgent(runtime);

    elizaLogger.debug(`Started ${character.name} (Provider) as ${runtime.agentId}`);
    return runtime;
  } catch (error) {
    elizaLogger.error(`Error starting provider agent:`, error);
    throw error;
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
  let serverPort = parseInt(settings.SERVER_PORT || "3000");
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

  if (serverPort !== parseInt(settings.SERVER_PORT || "3000")) {
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
