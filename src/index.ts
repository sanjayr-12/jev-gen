import { existsSync } from "node:fs";
import { ClefClient } from "./clef.js";
import { startCli } from "./cli.js";
import { generate } from "./generator.js";
import type { GeneratorConfig } from "./types.js";

function loadCredentials(): { accountId: string; apiToken: string } {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are not set");
  }
  return { accountId, apiToken };
}

async function main(): Promise<void> {
  const { accountId, apiToken } = loadCredentials();
  const client = new ClefClient(accountId, apiToken);
  await startCli((startingText) => {
    const config: GeneratorConfig = {
      startingPrompt: startingText,
      maxGeneratedCharacters: 200,
      debug: false,
    };
    return generate(
      (textSoFar, lastSelections, evaluateDegeneration) =>
        client.askNextStep(textSoFar, lastSelections, evaluateDegeneration),
      (textSoFar, candidates) => client.validateCandidates(textSoFar, candidates),
      config
    );
  });
}

main().catch((error: unknown) => {
  console.error(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
