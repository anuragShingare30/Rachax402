/**
 * Test script for Agent A → Agent B coordination
 * Run with: node test-coordination.js
 */

import axios from "axios";

const colors = {
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
};

const log = (color, message) => console.log(`${color}${message}${colors.reset}`);

async function checkAgent(port, name) {
  try {
    await axios.get(`http://localhost:${port}`, { timeout: 1000 });
    log(colors.green, `✓ ${name} is running on port ${port}`);
    return true;
  } catch (error) {
    log(colors.yellow, `⚠ ${name} is not running on port ${port}`);
    return false;
  }
}

async function testDirectClient() {
  log(colors.blue, "\nTest 1: Send message to Agent A (Requester) via DirectClient");
  console.log("─".repeat(70));

  try {
    const response = await axios.post(
      "http://localhost:3000/message",
      {
        text: "I need to analyze a CSV dataset with sales data",
        userId: "test-user-001",
        roomId: "test-room",
      },
      { timeout: 5000 }
    );

    log(colors.green, "✓ Message sent successfully");
    console.log("Response:", JSON.stringify(response.data).substring(0, 200) + "...");
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      log(colors.yellow, "⚠ DirectClient not running (start with: pnpm start)");
    } else {
      log(colors.yellow, `⚠ Error: ${error.message}`);
    }
  }
}

async function testProviderEndpoint() {
  log(colors.blue, "\nTest 2: Direct HTTP request to Agent B (Provider) /analyze endpoint");
  console.log("─".repeat(70));

  try {
    const response = await axios.post(
      "http://localhost:3001/analyze",
      {
        inputCID: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        requirements: "statistical summary and trend analysis",
      },
      {
        validateStatus: (status) => status === 200 || status === 402,
        timeout: 5000,
      }
    );

    if (response.status === 402) {
      log(colors.green, "✓ Provider correctly returned HTTP 402 (Payment Required)");
      console.log("Response:", JSON.stringify(response.data).substring(0, 300) + "...");
    } else if (response.status === 200) {
      log(colors.green, "✓ Provider processed request successfully");
      console.log("Response:", JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      log(colors.yellow, "⚠ Provider Express server not running");
      log(colors.yellow, "  Start with: AGENT_MODE=provider pnpm start");
    } else if (error.response) {
      log(colors.yellow, `⚠ Unexpected status: ${error.response.status}`);
      console.log("Response:", JSON.stringify(error.response.data).substring(0, 200));
    } else {
      log(colors.yellow, `⚠ Error: ${error.message}`);
    }
  }
}

async function main() {
  console.log("\n🧪 Rachax402 Agent Coordination Test");
  console.log("=".repeat(70));
  console.log("\n📡 Checking agent status...\n");

  const directClientUp = await checkAgent(3000, "DirectClient (ElizaOS)");
  const providerUp = await checkAgent(3001, "Provider Express Server");

  console.log("\n" + "━".repeat(70) + "\n");

  if (!directClientUp || !providerUp) {
    log(colors.yellow, "⚠ Warning: Some agents are not running\n");
    console.log("To start the agents, run:");
    console.log("  pnpm start");
    console.log("\nOr start them separately:");
    console.log("  AGENT_MODE=requester pnpm start  # Agent A (Requester)");
    console.log("  AGENT_MODE=provider pnpm start   # Agent B (Provider)");
    console.log("\nContinuing with tests anyway...\n");
  }

  await testDirectClient();
  await testProviderEndpoint();

  console.log("\n" + "━".repeat(70));
  log(colors.blue, "\n📋 Test Summary\n");

  console.log("Expected Workflow:");
  console.log("  1. Agent A (Requester) receives message via DirectClient (port 3000)");
  console.log("  2. Agent A discovers Agent B via ERC-8004 registry");
  console.log("  3. Agent A uploads input data to Storacha → gets inputCID");
  console.log("  4. Agent A sends HTTP POST to Agent B's /analyze endpoint (port 3001)");
  console.log("  5. Agent B returns HTTP 402 with payment requirements");
  console.log("  6. Agent A signs payment and retries with x-402-payment header");
  console.log("  7. Agent B verifies payment → processes data → returns resultCID");
  console.log("  8. Agent A retrieves results from Storacha");
  console.log("\nTo test the full workflow:");
  console.log("  1. Ensure both agents are running: pnpm start");
  console.log("  2. Send a message to Agent A via DirectClient API");
  console.log("  3. Monitor logs to see the coordination flow");
  console.log("");

  log(colors.green, "✅ Test script completed\n");
}

main().catch((error) => {
  console.error("Test script error:", error);
  process.exit(1);
});
