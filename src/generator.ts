import { CHOICE_CHARACTERS } from "./choices.js";
import type {
  AskNextStep,
  ChoiceAnswer,
  GeneratorConfig,
  GenerationResult,
  GenerationStep,
  StepDecision,
  StepSelection,
  StopReason,
} from "./types.js";

const END_THRESHOLD = 0.5;
const SELECTION_WINDOW = 8;

type StepOutcome = { stop: StopReason } | { continue: StepSelection };

function argmax(probabilities: Record<string, number>): { id: string; probability: number } {
  let id = "";
  let probability = Number.NEGATIVE_INFINITY;
  for (const [key, value] of Object.entries(probabilities)) {
    if (value > probability) {
      id = key;
      probability = value;
    }
  }
  return { id, probability };
}

function memberAnswerFor(classId: string, decision: StepDecision): ChoiceAnswer | null {
  if (classId === "LETTER") {
    return decision.letter;
  }
  if (classId === "DIGIT") {
    return decision.digit;
  }
  if (classId === "PUNCTUATION") {
    return decision.punctuation;
  }
  return null;
}

function selectCharacter(decision: StepDecision): StepSelection {
  const classPick = argmax(decision.characterClass.probabilities);
  const memberAnswer = memberAnswerFor(classPick.id, decision);
  const source = memberAnswer ?? decision.characterClass;
  const pick = argmax(source.probabilities);
  const selectedChoice = memberAnswer ? pick.id : classPick.id;
  const character = CHOICE_CHARACTERS[selectedChoice];
  if (character === undefined) {
    throw new Error(`Unknown choice id: ${selectedChoice}`);
  }
  return {
    characterClass: classPick.id,
    classProbability: classPick.probability,
    selectedChoice,
    selectedProbability: memberAnswer ? pick.probability : classPick.probability,
    topLevelChoice: source.choice,
    confidence: source.confidence,
    character,
  };
}

function outcomeFor(decision: StepDecision): StepOutcome {
  if (decision.isDegenerate >= END_THRESHOLD) {
    return { stop: "degeneration" };
  }
  if (decision.shouldEnd >= END_THRESHOLD) {
    return { stop: "end-decision" };
  }
  return { continue: selectCharacter(decision) };
}

function formatStep(step: GenerationStep): string {
  const index = String(step.step).padStart(3, "0");
  const suffix = `should_end=${step.decision.shouldEnd.toFixed(4)} degen=${step.decision.isDegenerate.toFixed(4)}`;
  if (step.selection === null) {
    return `[${index}] stop ${suffix}`;
  }
  const selection = step.selection;
  return `[${index}] selected=${selection.selectedChoice} probability=${selection.selectedProbability.toFixed(4)} confidence=${selection.confidence.toFixed(2)} class=${selection.characterClass} ${selection.classProbability.toFixed(4)} ${suffix}`;
}

function formatDistribution(label: string, probabilities: Record<string, number>): string {
  const rows = Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .map(([id, value]) => `        ${id.padEnd(14)} ${value.toFixed(4)}`)
    .join("\n");
  return `      ${label}\n${rows}`;
}

function printDebug(decision: StepDecision): void {
  console.log(`      should_end ${decision.shouldEnd.toFixed(4)}`);
  console.log(`      is_degenerate ${decision.isDegenerate.toFixed(4)}`);
  console.log(formatDistribution("class", decision.characterClass.probabilities));
  console.log(formatDistribution("letter", decision.letter.probabilities));
  console.log(formatDistribution("digit", decision.digit.probabilities));
  console.log(formatDistribution("punctuation", decision.punctuation.probabilities));
}

export async function generate(
  askNextStep: AskNextStep,
  config: GeneratorConfig
): Promise<GenerationResult> {
  let textSoFar = config.startingPrompt;
  let generatedCharacters = 0;
  const selections: string[] = [];
  const steps: GenerationStep[] = [];
  let stopReason: StopReason = "max-characters";

  while (generatedCharacters < config.maxGeneratedCharacters) {
    const textBefore = textSoFar;
    const decision = await askNextStep(textSoFar, selections.slice(-SELECTION_WINDOW));
    const outcome = outcomeFor(decision);
    const step: GenerationStep = {
      step: steps.length + 1,
      textBefore,
      decision,
      selection: "continue" in outcome ? outcome.continue : null,
    };
    steps.push(step);
    console.log(formatStep(step));
    if (config.debug) {
      printDebug(decision);
    }
    if ("stop" in outcome) {
      stopReason = outcome.stop;
      break;
    }
    const selection = outcome.continue;
    textSoFar = textBefore + selection.character;
    selections.push(selection.selectedChoice);
    generatedCharacters += 1;
    console.log(`text: ${JSON.stringify(textSoFar)}`);
    if (generatedCharacters >= config.maxGeneratedCharacters) {
      stopReason = "max-characters";
      break;
    }
  }

  return { text: textSoFar, generatedCharacters, steps, stopReason };
}
