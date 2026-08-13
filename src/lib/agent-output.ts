/**
 * Agent tool arguments sometimes contain JSON-escaped line breaks as the
 * literal characters "\\n" instead of real newlines. Decode those values at
 * the boundary where they become user-visible or are persisted.
 */
export function decodeEscapedLineBreaks(value: string): string {
    // Do not rewrite legitimate escape sequences inside already-multiline code.
    if (value.includes("\n") || value.includes("\r")) {
        return value;
    }

    if (!value.includes("\\n") && !value.includes("\\r")) {
        return value;
    }

    return value
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t");
}

export function normalizeSuggestedFixes<T extends {
    existingSnippet?: string;
    updatedSnippet: string;
}>(fixes: T[]): T[] {
    return fixes.map((fix) => ({
        ...fix,
        existingSnippet: fix.existingSnippet
            ? decodeEscapedLineBreaks(fix.existingSnippet)
            : fix.existingSnippet,
        updatedSnippet: decodeEscapedLineBreaks(fix.updatedSnippet),
    }));
}
