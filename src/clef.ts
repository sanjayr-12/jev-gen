import {
  CHARACTER_CLASSES,
  DIGIT_CRITERIA,
  LETTER_CRITERIA,
  PUNCTUATION_CRITERIA,
} from "./choices.js";
import type { StepDecision, TextCandidate } from "./types.js";

export const SHOULD_END_INSTRUCTIONS =
  "Given the text in text_so_far, is the text naturally complete at its end so that no additional character should be written if this text were continued as natural written English?";

export const IS_DEGENERATE_INSTRUCTIONS =
  "Given the text in text_so_far and the recent selections in last_selections, has the text collapsed into repetitive or meaningless text such that generation should stop?";

export const CLASS_INSTRUCTIONS =
  "Given the text in text_so_far and its last_character, what kind of single character would most naturally appear immediately after the final character if this text were continued as natural written English?";

export const LETTER_INSTRUCTIONS =
  "If the next character is a letter, which single letter would most naturally appear immediately after the final character of text_so_far?";

export const DIGIT_INSTRUCTIONS =
  "If the next character is a digit, which single digit would most naturally appear immediately after the final character of text_so_far?";

export const PUNCTUATION_INSTRUCTIONS =
  "If the next character is a punctuation or symbol character, which single one would most naturally appear immediately after the final character of text_so_far?";

export const CANDIDATE_PLAUSIBLE_INSTRUCTIONS =
  "Given the text in `text_so_far` and the proposed next character in `proposed_character`, would accepting this character leave the current unfinished word shown in `proposed_text` as a plausible prefix or complete word for a natural continuation of the text? The current word does NOT need to already be a complete word. Answer YES when the resulting letters could reasonably continue into a natural word that fits the preceding context. Answer NO when accepting the character makes the current word unlikely to develop into a natural word that fits the context. When `proposed_character` is a space, the word before the space must already be a complete word that fits the preceding context: answer NO when the word before the space is only a prefix or is unlikely to be a natural word.";

function choice(instructions: unknown, criteria: Record<string, unknown>) {
  return { type: "choice", instructions, criteria };
}

function noul(instructions: unknown, criteria?: { true: string; false: string }) {
  return { type: "noul", instructions, criteria };
}

export class ClefClient {
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly model: string;

  constructor(accountId: string, apiToken: string, model: string = "@cf/cloudflare/clef") {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.model = model;
  }

  private async callClef(state: unknown, questions: Record<string, unknown>): Promise<any> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ state, questions }),
    });
    const json = (await response.json()) as any;
    if (!response.ok || !json.success) {
      const errMsg = json.errors?.[0]?.message || response.statusText;
      throw new Error(`Cloudflare Clef API error (${response.status}): ${errMsg}`);
    }
    return json.result?.answers ?? json.result;
  }

  async askNextStep(
    textSoFar: string,
    lastSelections: string[],
    evaluateDegeneration: boolean
  ): Promise<StepDecision> {
    const startedAt = Date.now();
    const state = {
      text_so_far: textSoFar,
      last_character: textSoFar.slice(-1),
      last_selections: lastSelections,
    };
    const coreQuestions = {
      should_end: noul(SHOULD_END_INSTRUCTIONS, {
        true: "The text is complete and should end here. No additional character should be written.",
        false: "The text is not complete and should continue with more characters.",
      }),
      character_class: choice(CLASS_INSTRUCTIONS, CHARACTER_CLASSES),
      next_letter: choice(LETTER_INSTRUCTIONS, LETTER_CRITERIA),
      next_digit: choice(DIGIT_INSTRUCTIONS, DIGIT_CRITERIA),
      next_punctuation: choice(PUNCTUATION_INSTRUCTIONS, PUNCTUATION_CRITERIA),
    };

    if (evaluateDegeneration) {
      const answers = await this.callClef(state, {
        ...coreQuestions,
        is_degenerate: noul(IS_DEGENERATE_INSTRUCTIONS, {
          true: "The text is repetitive, looping, or meaningless and generation should stop.",
          false: "The text is coherent natural written English and generation should continue.",
        }),
      });
      const latencyMs = Date.now() - startedAt;
      return {
        shouldEnd: answers.should_end.noul,
        isDegenerate: answers.is_degenerate.noul,
        characterClass: answers.character_class,
        letter: answers.next_letter,
        digit: answers.next_digit,
        punctuation: answers.next_punctuation,
        latencyMs,
      };
    }

    const answers = await this.callClef(state, coreQuestions);
    const latencyMs = Date.now() - startedAt;
    return {
      shouldEnd: answers.should_end.noul,
      isDegenerate: null,
      characterClass: answers.character_class,
      letter: answers.next_letter,
      digit: answers.next_digit,
      punctuation: answers.next_punctuation,
      latencyMs,
    };
  }

  async validateCandidates(textSoFar: string, candidates: TextCandidate[]): Promise<number[]> {
    const questions: Record<string, unknown> = {};
    for (const [index, candidate] of candidates.entries()) {
      questions[`candidate_${index + 1}`] = noul(
        {
          question: CANDIDATE_PLAUSIBLE_INSTRUCTIONS,
          proposed_character: candidate.character,
          proposed_text: candidate.proposedText,
        },
        {
          true: "The proposed character keeps the current word plausible and any word boundary it creates sensible.",
          false: "The proposed character makes the current word unlikely to develop into a natural word, or creates an invalid word boundary.",
        }
      );
    }
    const answers = await this.callClef(
      {
        text_so_far: textSoFar,
        last_character: textSoFar.slice(-1),
      },
      questions
    );
    return candidates.map((_, index) => answers[`candidate_${index + 1}`].noul);
  }
}
