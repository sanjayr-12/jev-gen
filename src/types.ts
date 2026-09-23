export interface ChoiceDefinition {
  id: string;
  description: string;
  character: string | null;
}

export interface ChoiceAnswer {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface StepDecision {
  shouldEnd: number;
  isDegenerate: number;
  characterClass: ChoiceAnswer;
  letter: ChoiceAnswer;
  digit: ChoiceAnswer;
  punctuation: ChoiceAnswer;
  latencyMs: number;
}

export type AskNextStep = (textSoFar: string, lastSelections: string[]) => Promise<StepDecision>;

export interface StepSelection {
  characterClass: string;
  classProbability: number;
  selectedChoice: string;
  selectedProbability: number;
  topLevelChoice: string;
  confidence: number;
  character: string;
}

export interface GenerationStep {
  step: number;
  textBefore: string;
  decision: StepDecision;
  selection: StepSelection | null;
}

export interface GeneratorConfig {
  startingPrompt: string;
  maxGeneratedCharacters: number;
  debug: boolean;
}

export type StopReason = "end-decision" | "degeneration" | "max-characters";

export interface GenerationResult {
  text: string;
  generatedCharacters: number;
  steps: GenerationStep[];
  stopReason: StopReason;
}

export type GenerateContinuation = (startingText: string) => Promise<GenerationResult>;
