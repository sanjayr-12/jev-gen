import { BOUNDARY_IDS, CHOICE_CHARACTERS } from "./choices.js";
import type {
  AskNextStep,
  CandidateCheck,
  ChoiceAnswer,
  GeneratorConfig,
  GenerationResult,
  GenerationStep,
  StepDecision,
  StepSelection,
  StopReason,
  TextCandidate,
  ValidateCandidates,
} from "./types.js";

const END_THRESHOLD = 0.5;
const PLAUSIBILITY_THRESHOLD = 0.5;
const SELECTION_WINDOW = 8;
const LETTER_CANDIDATES = 5;
const SPACE_ID = "SPACE";

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

function characterFor(selectedChoice: string): string {
  const character = CHOICE_CHARACTERS[selectedChoice];
  if (character === undefined) {
    throw new Error(`Unknown choice id: ${selectedChoice}`);
  }
  return character;
}

function memberAnswerFor(classId: string, decision: StepDecision): ChoiceAnswer | null {
  if (classId === "DIGIT") {
    return decision.digit;
  }
  if (classId === "PUNCTUATION") {
    return decision.punctuation;
  }
  return null;
}

function selectFromClass(
  decision: StepDecision,
  classPick: { id: string; probability: number }
): StepSelection {
  const memberAnswer = memberAnswerFor(classPick.id, decision);
  const source = memberAnswer ?? decision.characterClass;
  const pick = argmax(source.probabilities);
  const selectedChoice = memberAnswer ? pick.id : classPick.id;
  return {
    characterClass: classPick.id,
    classProbability: classPick.probability,
    selectedChoice,
    selectedProbability: memberAnswer ? pick.probability : classPick.probability,
    topLevelChoice: source.choice,
    confidence: source.confidence,
    character: characterFor(selectedChoice),
  };
}

function rankLetterCandidates(decision: StepDecision, textBefore: string): TextCandidate[] {
  return Object.entries(decision.letter.probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LETTER_CANDIDATES)
    .map(([id, probability]) => ({
      selectedChoice: id,
      character: characterFor(id),
      proposedText: textBefore + characterFor(id),
      probability,
    }));
}

function buildCandidates(
  decision: StepDecision,
  textBefore: string,
  classPick: { id: string; probability: number }
): TextCandidate[] {
  const letters = rankLetterCandidates(decision, textBefore);
  const space: TextCandidate = {
    selectedChoice: SPACE_ID,
    character: characterFor(SPACE_ID),
    proposedText: textBefore + characterFor(SPACE_ID),
    probability: decision.characterClass.probabilities[SPACE_ID] ?? classPick.probability,
  };
  return classPick.id === SPACE_ID ? [space, ...letters] : [...letters, space];
}

function formatValidation(checks: CandidateCheck[]): string {
  const acceptedIndex = checks.findIndex((check) => check.accepted);
  const rejected = (acceptedIndex === -1 ? checks : checks.slice(0, acceptedIndex))
    .map((check) => `${check.selectedChoice} ${check.plausible.toFixed(2)}`)
    .join(", ");
  const tries = acceptedIndex === -1 ? checks.length : acceptedIndex + 1;
  const label = acceptedIndex === -1 ? "validation failed" : "validated";
  return `${label} tries=${tries}${rejected ? ` (${rejected} rejected)` : ""}`;
}

function formatDegenerate(value: number | null): string {
  return value === null ? "-" : value.toFixed(4);
}

function formatStep(step: GenerationStep): string {
  const index = String(step.step).padStart(3, "0");
  const suffix = `should_end=${step.decision.shouldEnd.toFixed(4)} degen=${formatDegenerate(step.decision.isDegenerate)}`;
  const validationSuffix = step.validation === null ? "" : ` ${formatValidation(step.validation)}`;
  if (step.selection === null) {
    return `[${index}] stop ${suffix}${validationSuffix}`;
  }
  const selection = step.selection;
  return `[${index}] selected=${selection.selectedChoice} probability=${selection.selectedProbability.toFixed(4)} confidence=${selection.confidence.toFixed(2)} class=${selection.characterClass} ${selection.classProbability.toFixed(4)} ${suffix}${validationSuffix}`;
}

function formatDistribution(label: string, probabilities: Record<string, number>): string {
  const rows = Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .map(([id, value]) => `        ${id.padEnd(14)} ${value.toFixed(4)}`)
    .join("\n");
  return `      ${label}\n${rows}`;
}

function formatChecks(checks: CandidateCheck[]): string {
  return checks
    .map(
      (check) =>
        `      ${check.selectedChoice.padEnd(14)} probability=${check.probability.toFixed(4)} proposed=${JSON.stringify(check.proposedText)} plausible=${check.plausible.toFixed(4)} ${check.accepted ? "accepted" : "rejected"}`
    )
    .join("\n");
}

function printDebug(decision: StepDecision, validation: CandidateCheck[] | null): void {
  console.log(`      should_end ${decision.shouldEnd.toFixed(4)}`);
  console.log(`      is_degenerate ${formatDegenerate(decision.isDegenerate)}`);
  console.log(formatDistribution("class", decision.characterClass.probabilities));
  console.log(formatDistribution("letter", decision.letter.probabilities));
  console.log(formatDistribution("digit", decision.digit.probabilities));
  console.log(formatDistribution("punctuation", decision.punctuation.probabilities));
  if (validation !== null) {
    console.log(`      validation`);
    console.log(formatChecks(validation));
  }
}

export async function generate(
  askNextStep: AskNextStep,
  validateCandidates: ValidateCandidates,
  config: GeneratorConfig
): Promise<GenerationResult> {
  let textSoFar = config.startingPrompt;
  let generatedCharacters = 0;
  let lastCommitWasBoundary = false;
  const selections: string[] = [];
  const steps: GenerationStep[] = [];
  let stopReason: StopReason = "max-characters";

  while (generatedCharacters < config.maxGeneratedCharacters) {
    const textBefore = textSoFar;
    const decision = await askNextStep(
      textSoFar,
      selections.slice(-SELECTION_WINDOW),
      lastCommitWasBoundary
    );
    const termination =
      decision.isDegenerate !== null && decision.isDegenerate >= END_THRESHOLD
        ? "degeneration"
        : decision.shouldEnd >= END_THRESHOLD
          ? "end-decision"
          : null;

    if (termination !== null) {
      const step: GenerationStep = {
        step: steps.length + 1,
        textBefore,
        decision,
        selection: null,
        validation: null,
      };
      steps.push(step);
      console.log(formatStep(step));
      if (config.debug) {
        printDebug(decision, null);
      }
      stopReason = termination;
      break;
    }

    const classPick = argmax(decision.characterClass.probabilities);
    let selection: StepSelection;
    let validation: CandidateCheck[] | null = null;

    if (classPick.id === "LETTER" || classPick.id === SPACE_ID) {
      const candidates = buildCandidates(decision, textBefore, classPick);
      const plausible = await validateCandidates(textBefore, candidates);
      validation = candidates.map((candidate, index) => ({
        ...candidate,
        plausible: plausible[index],
        accepted: false,
      }));
      const acceptedIndex = validation.findIndex(
        (check) => check.plausible >= PLAUSIBILITY_THRESHOLD
      );
      if (acceptedIndex === -1) {
        const failedStep: GenerationStep = {
          step: steps.length + 1,
          textBefore,
          decision,
          selection: null,
          validation,
        };
        steps.push(failedStep);
        console.log(formatStep(failedStep));
        if (config.debug) {
          printDebug(decision, validation);
        }
        stopReason = "validation-failed";
        break;
      }
      validation[acceptedIndex].accepted = true;
      const accepted = validation[acceptedIndex];
      const source = accepted.selectedChoice === SPACE_ID ? decision.characterClass : decision.letter;
      selection = {
        characterClass: classPick.id,
        classProbability: classPick.probability,
        selectedChoice: accepted.selectedChoice,
        selectedProbability: accepted.probability,
        topLevelChoice: source.choice,
        confidence: source.confidence,
        character: accepted.character,
      };
    } else {
      selection = selectFromClass(decision, classPick);
    }

    const step: GenerationStep = {
      step: steps.length + 1,
      textBefore,
      decision,
      selection,
      validation,
    };
    steps.push(step);
    console.log(formatStep(step));
    if (config.debug) {
      printDebug(decision, validation);
    }

    textSoFar = textBefore + selection.character;
    selections.push(selection.selectedChoice);
    lastCommitWasBoundary = BOUNDARY_IDS.has(selection.selectedChoice);
    generatedCharacters += 1;
    console.log(`text: ${JSON.stringify(textSoFar)}`);
    if (generatedCharacters >= config.maxGeneratedCharacters) {
      stopReason = "max-characters";
      break;
    }
  }

  return { text: textSoFar, generatedCharacters, steps, stopReason };
}
