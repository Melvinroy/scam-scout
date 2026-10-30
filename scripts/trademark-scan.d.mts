export function decodeEscapes(text: string): string;
export function presentationSource(file: string, content: string): string;
export function trademarkMatches(content: string, terms: string[], options?: { built?: boolean }): string[];
export function builtTrademarkViolations(directory: string, terms: string[]): Array<{ file: string; term: string }>;
export const BUILT_COMPATIBILITY_TOKENS: string[];
