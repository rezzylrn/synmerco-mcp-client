/**
 * List Synmerco's MCP tools, then call search_agents and estimate_fees
 * on a 100 USD job -- using only free tools, no Synmerco key and no
 * AI model key.
 *
 * The script starts the pinned @synmerco/mcp-server from node_modules
 * (npx --no-install @synmerco/mcp-server) over stdio with the official
 * MCP TypeScript SDK, lists its tools, calls search_agents with a
 * capability (default: code_review) and estimate_fees with amountCents
 * 10000 (100 USD, fees take amounts in cents).
 *
 * Usage:
 *   npm start -- code_review
 *
 * Only each agent's agentDid, synmercoScore, tier and capabilities are
 * printed. No display names, descriptions or URLs are shown.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const CAPABILITY = process.argv[2] ?? "code_review";

interface AgentResult {
  agentDid?: string;
  synmercoScore?: number;
  tier?: string;
  capabilities?: string[];
}

function textOf(result: unknown): string {
  if (typeof result !== "object" || result === null || !("content" in result)) {
    return "";
  }
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  const texts: string[] = [];
  for (const part of content) {
    if (
      typeof part === "object" &&
      part !== null &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      texts.push((part as { text: string }).text);
    }
  }
  return texts.join("\n");
}

async function main(): Promise<number> {
  // The SDK's stdio transport only inherits an allowlist of env vars, so
  // proxy settings (HTTPS_PROXY) would not reach the server. Forward the
  // parent environment explicitly. Also narrow NO_PROXY: httpx/fetch
  // stacks fail to parse bracketed IPv6 entries such as [::1] in it
  // ("Invalid port: ':1]'").
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["--no-install", "@synmerco/mcp-server"],
    stderr: "pipe",
    env: {
      ...process.env,
      NO_PROXY: "localhost,127.0.0.1",
      no_proxy: "localhost,127.0.0.1",
    },
  });

  const client = new Client(
    { name: "synmerco-mcp-client", version: "1.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    console.log(`Tools (${tools.tools.length}):`);
    for (const tool of tools.tools) {
      console.log(`- ${tool.name}`);
    }

    console.log(`\n--- search_agents (capability: ${CAPABILITY}) ---`);
    const search = await client.callTool({
      name: "search_agents",
      arguments: { capability: CAPABILITY, limit: 3 },
    });
    if (search.isError) {
      console.log(`search_agents error: ${textOf(search)}`);
    } else {
      const result = JSON.parse(textOf(search)) as {
        totalResults?: number;
        agents?: AgentResult[];
      };
      console.log(`totalResults: ${result.totalResults}`);
      for (const agent of result.agents ?? []) {
        console.log(`agentDid: ${agent.agentDid}`);
        console.log(`  synmercoScore: ${agent.synmercoScore}`);
        console.log(`  tier: ${agent.tier}`);
        console.log(`  capabilities: ${(agent.capabilities ?? []).join(", ")}`);
      }
    }

    console.log("\n--- estimate_fees (amountCents 10000 = 100 USD) ---");
    const fees = await client.callTool({
      name: "estimate_fees",
      arguments: { amountCents: 10000 },
    });
    if (fees.isError) {
      console.log(`estimate_fees error: ${textOf(fees)}`);
    } else {
      const f = JSON.parse(textOf(fees)) as {
        grossCents?: number;
        feeCents?: number;
        feePercent?: string;
        tierName?: string;
        netToSellerCents?: number;
      };
      console.log(`grossCents: ${f.grossCents}`);
      console.log(`feeCents: ${f.feeCents} (${f.feePercent})`);
      console.log(`tierName: ${f.tierName}`);
      console.log(`netToSellerCents: ${f.netToSellerCents}`);
    }
    return 0;
  } finally {
    await client.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
