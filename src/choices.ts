import type { ChoiceDefinition } from "./types.js";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";

function letterChoices(upper: boolean): ChoiceDefinition[] {
  return [...LETTERS].map((letter) => {
    const character = upper ? letter.toUpperCase() : letter;
    return {
      id: `${upper ? "UPPER" : "LOWER"}_${letter.toUpperCase()}`,
      description: upper ? `uppercase letter ${character}` : `lowercase letter ${character}`,
      character,
    };
  });
}

function digitChoices(): ChoiceDefinition[] {
  return [...DIGITS].map((digit) => ({
    id: `DIGIT_${digit}`,
    description: `digit ${digit}`,
    character: digit,
  }));
}

const PUNCTUATION_CHOICES: ChoiceDefinition[] = [
  { id: "PERIOD", description: "period .", character: "." },
  { id: "COMMA", description: "comma ,", character: "," },
  { id: "QUESTION", description: "question mark ?", character: "?" },
  { id: "EXCLAMATION", description: "exclamation mark !", character: "!" },
  { id: "COLON", description: "colon :", character: ":" },
  { id: "SEMICOLON", description: "semicolon ;", character: ";" },
  { id: "APOSTROPHE", description: "apostrophe '", character: "'" },
  { id: "DOUBLE_QUOTE", description: 'double quote "', character: '"' },
  { id: "HYPHEN", description: "hyphen -", character: "-" },
  { id: "OPEN_PAREN", description: "open parenthesis (", character: "(" },
  { id: "CLOSE_PAREN", description: "close parenthesis )", character: ")" },
  { id: "OPEN_BRACKET", description: "open bracket [", character: "[" },
  { id: "CLOSE_BRACKET", description: "close bracket ]", character: "]" },
  { id: "SLASH", description: "slash /", character: "/" },
  { id: "BACKSLASH", description: "backslash \\", character: "\\" },
  { id: "AT", description: "at sign @", character: "@" },
  { id: "HASH", description: "hash #", character: "#" },
  { id: "DOLLAR", description: "dollar sign $", character: "$" },
  { id: "PERCENT", description: "percent %", character: "%" },
  { id: "AMPERSAND", description: "ampersand &", character: "&" },
  { id: "ASTERISK", description: "asterisk *", character: "*" },
  { id: "PLUS", description: "plus +", character: "+" },
  { id: "EQUALS", description: "equals =", character: "=" },
  { id: "UNDERSCORE", description: "underscore _", character: "_" },
  { id: "LESS_THAN", description: "less-than sign <", character: "<" },
  { id: "GREATER_THAN", description: "greater-than sign >", character: ">" },
];

const LETTER_DEFINITIONS = [...letterChoices(false), ...letterChoices(true)];
const DIGIT_DEFINITIONS = digitChoices();

function criteriaOf(definitions: ChoiceDefinition[]): Record<string, string> {
  return Object.fromEntries(definitions.map((definition) => [definition.id, definition.description]));
}

function charactersOf(definitions: ChoiceDefinition[]): Record<string, string> {
  return Object.fromEntries(
    definitions.flatMap((definition): Array<[string, string]> =>
      definition.character === null ? [] : [[definition.id, definition.character]]
    )
  );
}

export const CHARACTER_CLASSES = {
  LETTER: "a letter character (a-z, A-Z)",
  DIGIT: "a digit character (0-9)",
  SPACE: {
    character: " ",
    "ASCII decimal": "32",
    "ASCII hex": "0x20",
    description: "ASCII space character",
  },
  NEWLINE: "a line break / newline character",
  PUNCTUATION: "a punctuation or symbol character such as . , ? ! : ; ' - ( )",
};

export const LETTER_CRITERIA = criteriaOf(LETTER_DEFINITIONS);
export const DIGIT_CRITERIA = criteriaOf(DIGIT_DEFINITIONS);
export const PUNCTUATION_CRITERIA = criteriaOf(PUNCTUATION_CHOICES);

export const BOUNDARY_IDS = new Set([
  "SPACE",
  "NEWLINE",
  ...PUNCTUATION_CHOICES.map((definition) => definition.id).filter(
    (id) => id !== "APOSTROPHE" && id !== "HYPHEN"
  ),
]);

export const CHOICE_CHARACTERS: Record<string, string> = {
  ...charactersOf(LETTER_DEFINITIONS),
  ...charactersOf(DIGIT_DEFINITIONS),
  ...charactersOf(PUNCTUATION_CHOICES),
  SPACE: " ",
  NEWLINE: "\n",
};
