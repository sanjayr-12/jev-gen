import { choice, noul, TypeSafeClient, type NoulQuestion } from "@typesafe-ai/sdk";
import {
  CHARACTER_CLASSES,
  DIGIT_CRITERIA,
  LETTER_CRITERIA,
  PUNCTUATION_CRITERIA,
} from "./choices.js";
import type { LetterCandidate, StepDecision } from "./types.js";

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

export const LETTER_PLAUSIBLE_INSTRUCTIONS =
  "Given the text in `text_so_far` and the proposed next character in `proposed_character`, would accepting this character leave the current unfinished word shown in `proposed_text` as a plausible prefix or complete word for a natural continuation of the text? The current word does NOT need to already be a complete word. Answer YES when the resulting letters could reasonably continue into a natural word that fits the preceding context. Answer NO when accepting the character makes the current word unlikely to develop into a natural word that fits the context.";

export class JevClient {
  private readonly client: TypeSafeClient;

  constructor(apiKey: string) {
    this.client = new TypeSafeClient({ apiKey });
  }

  async askNextStep(textSoFar: string, lastSelections: string[]): Promise<StepDecision> {
    const startedAt = Date.now();
    const response = await this.client.systemOne({
      model: "jev-latest",
      state: {
        text_so_far: textSoFar,
        last_character: textSoFar.slice(-1),
        last_selections: lastSelections,
      },
      questions: {
        should_end: noul(SHOULD_END_INSTRUCTIONS, {
          true: "The text is complete and should end here. No additional character should be written.",
          false: "The text is not complete and should continue with more characters.",
        }),
        is_degenerate: noul(IS_DEGENERATE_INSTRUCTIONS, {
          true: "The text is repetitive, looping, or meaningless and generation should stop.",
          false: "The text is coherent natural written English and generation should continue.",
        }),
        character_class: choice(CLASS_INSTRUCTIONS, CHARACTER_CLASSES),
        next_letter: choice(LETTER_INSTRUCTIONS, LETTER_CRITERIA),
        next_digit: choice(DIGIT_INSTRUCTIONS, DIGIT_CRITERIA),
        next_punctuation: choice(PUNCTUATION_INSTRUCTIONS, PUNCTUATION_CRITERIA),
      },
    });
    const latencyMs = Date.now() - startedAt;
    return {
      shouldEnd: response.answers.should_end.noul,
      isDegenerate: response.answers.is_degenerate.noul,
      characterClass: response.answers.character_class,
      letter: response.answers.next_letter,
      digit: response.answers.next_digit,
      punctuation: response.answers.next_punctuation,
      latencyMs,
    };
  }

  async validateLetterCandidates(
    textSoFar: string,
    candidates: LetterCandidate[]
  ): Promise<number[]> {
    const questions: Record<string, NoulQuestion> = {};
    for (const [index, candidate] of candidates.entries()) {
      questions[`candidate_${index + 1}`] = noul(
        {
          question: LETTER_PLAUSIBLE_INSTRUCTIONS,
          proposed_character: candidate.character,
          proposed_text: candidate.proposedText,
        },
        {
          true: "The resulting word is a plausible prefix or complete word for a natural continuation of the text.",
          false: "The resulting word is unlikely to develop into a natural word that fits the context.",
        }
      );
    }
    const response = await this.client.systemOne({
      model: "jev-latest",
      state: {
        text_so_far: textSoFar,
        last_character: textSoFar.slice(-1),
      },
      questions,
    });
    return candidates.map(
      (_, index) => response.answers[`candidate_${index + 1}`].noul
    );
  }
}
