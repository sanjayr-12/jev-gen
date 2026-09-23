import { createInterface } from "node:readline";
import type { GenerateContinuation } from "./types.js";

const HELP_TEXT = `Commands:

gen "<text>"   Generate a continuation using Jev
help           Show available commands
exit           Exit the CLI`;

const GEN_USAGE = 'Usage: gen "<starting text>"';

function parseCommand(line: string): { command: string; argument: string } {
  const trimmed = line.trim();
  const separatorAt = trimmed.search(/\s/);
  if (separatorAt === -1) {
    return { command: trimmed, argument: "" };
  }
  return {
    command: trimmed.slice(0, separatorAt),
    argument: trimmed.slice(separatorAt + 1).trim(),
  };
}

function stripQuotes(text: string): string {
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1);
  }
  return text;
}

async function runGen(
  generateContinuation: GenerateContinuation,
  argument: string
): Promise<void> {
  const startingText = stripQuotes(argument);
  if (!startingText) {
    console.log(GEN_USAGE);
    return;
  }
  console.log("");
  console.log("Generating...");
  console.log("");
  const result = await generateContinuation(startingText);
  console.log("");
  console.log(result.text);
  console.log("");
  console.log("Generation finished.");
  console.log("");
}

export async function startCli(generateContinuation: GenerateContinuation): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
  let closed = false;
  rl.on("close", () => {
    closed = true;
  });
  rl.prompt();
  for await (const line of rl) {
    const { command, argument } = parseCommand(line);
    if (command === "exit") {
      break;
    }
    if (command === "help") {
      console.log(HELP_TEXT);
    } else if (command === "gen") {
      await runGen(generateContinuation, argument);
    } else if (command !== "") {
      console.log(`Unknown command: ${command}`);
      console.log('Type "help" to see available commands.');
    }
    if (closed) {
      break;
    }
    rl.prompt();
  }
  rl.close();
}
