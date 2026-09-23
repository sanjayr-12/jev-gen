import { existsSync } from "node:fs";
import { startCli } from "./cli.js";
import { generate } from "./generator.js";
import { JevClient } from "./jev.js";
import type { GeneratorConfig } from "./types.js";

function loadApiKey(): string {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
  const apiKey = process.env.JEV_API_KEY;
  if (!apiKey) {
    throw new Error("JEV_API_KEY is not set");
  }
  return apiKey;
}

async function main(): Promise<void> {
  const client = new JevClient(loadApiKey());
  await startCli((startingText) => {
    const config: GeneratorConfig = {
      startingPrompt: startingText,
      maxGeneratedCharacters: 200,
      debug: false,
    };
    return generate(
      (textSoFar, lastSelections) => client.askNextStep(textSoFar, lastSelections),
      (textSoFar, candidates) => client.validateLetterCandidates(textSoFar, candidates),
      config
    );
  });
}

main().catch((error: unknown) => {
  console.error(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
