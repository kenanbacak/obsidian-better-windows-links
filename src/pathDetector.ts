export type WindowsPathKind = "local" | "unc";

export interface DetectWindowsPathsOptions {
	/**
	 * CommonMark collapses a leading `\\` in UNC paths to a single `\` when
	 * rendering Markdown into HTML text nodes. Enable this in Reading View so
	 * `\server\share` is still recognized and normalized back to `\\server\share`.
	 */
	allowCollapsedUncPrefix?: boolean;
}

export interface DetectedWindowsPath {
	/** Exact substring matched in the input text. */
	rawMatch: string;
	/** Text to display to the user (e.g., link label or path). */
	displayText: string;
	/** Clean Windows path ready for shell.openPath / File Explorer. */
	normalizedPath: string;
	/** Inclusive start index in the input text. */
	start: number;
	/** Exclusive end index in the input text. */
	end: number;
	/** Whether the path targets a local drive or a UNC network share. */
	kind: WindowsPathKind;
	/** True when the raw match is wrapped in double quotes. */
	isQuoted: boolean;
	/** True when the raw match is wrapped in angle brackets. */
	isAngleBracketed: boolean;
}

interface TextRange {
	start: number;
	end: number;
}

const TRAILING_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?", "'", "\""]);
const LOCAL_DRIVE_PATTERN = /^[a-zA-Z]:\\[^:*?"<>|\r\n]*$/;
const UNC_PATTERN = /^\\\\[a-zA-Z0-9._-]+\\[^\\/:*?"<>|\r\n]+(?:\\[^:*?"<>|\r\n]*)*$/;
const COLLAPSED_UNC_PATTERN = /^\\[a-zA-Z0-9._-]+\\[^\\/:*?"<>|\r\n]+(?:\\[^:*?"<>|\r\n]*)*$/;

/**
 * Strips unbalanced trailing punctuation from an unquoted path match while
 * preserving balanced delimiters such as `(x86)` inside `C:\Program Files (x86)\...`.
 */
function trimTrailingPunctuation(candidate: string): string {
	let end = candidate.length;

	while (end > 0) {
		const lastChar = candidate[end - 1];
		if (TRAILING_PUNCTUATION.has(lastChar)) {
			end--;
			continue;
		}
		if (lastChar === ")" && countChar(candidate, "(", end) < countChar(candidate, ")", end)) {
			end--;
			continue;
		}
		if (lastChar === "]" && countChar(candidate, "[", end) < countChar(candidate, "]", end)) {
			end--;
			continue;
		}
		if (lastChar === "}" && countChar(candidate, "{", end) < countChar(candidate, "}", end)) {
			end--;
			continue;
		}
		break;
	}

	return candidate.slice(0, end);
}

function countChar(text: string, target: string, limit: number): number {
	let count = 0;
	for (let i = 0; i < limit; i++) {
		if (text[i] === target) {
			count++;
		}
	}
	return count;
}

function hasOverlap(ranges: readonly TextRange[], start: number, end: number): boolean {
	for (const range of ranges) {
		if (start < range.end && end > range.start) {
			return true;
		}
	}
	return false;
}

/**
 * Validates and normalizes a raw Windows path string (removing wrapping quotes or
 * angle brackets and restoring collapsed `\\` prefixes for UNC paths when enabled).
 */
export function normalizeWindowsPath(
	rawPath: string,
	options: DetectWindowsPathsOptions = {},
): { normalizedPath: string; kind: WindowsPathKind } | null {
	let trimmed = rawPath.trim();
	if (trimmed.length === 0) {
		return null;
	}

	if (
		(trimmed.startsWith("<") && trimmed.endsWith(">")) ||
		(trimmed.startsWith("\"") && trimmed.endsWith("\""))
	) {
		trimmed = trimmed.slice(1, -1).trim();
	}

	if (trimmed.length === 0) {
		return null;
	}

	if (LOCAL_DRIVE_PATTERN.test(trimmed)) {
		return { normalizedPath: trimmed, kind: "local" };
	}

	if (UNC_PATTERN.test(trimmed)) {
		return { normalizedPath: trimmed, kind: "unc" };
	}

	if (options.allowCollapsedUncPrefix && COLLAPSED_UNC_PATTERN.test(trimmed)) {
		return { normalizedPath: `\\${trimmed}`, kind: "unc" };
	}

	return null;
}

/**
 * Detects local Windows paths (`C:\...`) and UNC network paths (`\\server\share\...`)
 * in a string, supporting plain text, double-quoted paths, angle-bracketed paths,
 * and Markdown links.
 */
export function detectWindowsPaths(
	text: string,
	options: DetectWindowsPathsOptions = {},
): DetectedWindowsPath[] {
	if (text.length === 0) {
		return [];
	}

	const allowCollapsedUnc = Boolean(options.allowCollapsedUncPrefix);
	const results: DetectedWindowsPath[] = [];
	const occupied: TextRange[] = [];

	const addResult = (entry: DetectedWindowsPath): void => {
		if (hasOverlap(occupied, entry.start, entry.end)) {
			return;
		}
		occupied.push({ start: entry.start, end: entry.end });
		results.push(entry);
	};

	// 1. Markdown links: [Label](C:\...), [Label](<C:\My Folder\...>), [Label]("...")
	const markdownLinkRegex =
		/\[([^\]\r\n]+)\]\((<([^>\r\n]+)>|"([^"\r\n]+)"|([^()\r\n]*(?:\([^()\r\n]*\)[^()\r\n]*)*))\)/g;
	for (const match of text.matchAll(markdownLinkRegex)) {
		const start = match.index ?? -1;
		if (start < 0) {
			continue;
		}
		const rawMatch = match[0];
		const end = start + rawMatch.length;

		// Skip Markdown image embeds: ![alt](...)
		if (start > 0 && text[start - 1] === "!") {
			occupied.push({ start: start - 1, end });
			continue;
		}

		const label = match[1];
		const innerTarget = match[3] ?? match[4] ?? match[5] ?? "";
		const normalized = normalizeWindowsPath(innerTarget, options);
		if (!normalized) {
			continue;
		}

		addResult({
			rawMatch,
			displayText: label,
			normalizedPath: normalized.normalizedPath,
			start,
			end,
			kind: normalized.kind,
			isQuoted: false,
			isAngleBracketed: false,
		});
	}

	// 2. Angle-bracketed Windows paths: <C:\Program Files\...> or <\\server\Shared Folder\...>
	const angleBracketRegex = /<([a-zA-Z]:\\[^>\r\n]+|\\\\?[a-zA-Z0-9._-]+\\[^>\r\n]+)>/g;
	for (const match of text.matchAll(angleBracketRegex)) {
		const start = match.index ?? -1;
		if (start < 0) {
			continue;
		}
		const rawMatch = match[0];
		const inner = match[1];
		const normalized = normalizeWindowsPath(inner, options);
		if (!normalized) {
			continue;
		}
		const restoredCollapsedUnc =
			normalized.kind === "unc" && inner.startsWith("\\") && !inner.startsWith("\\\\");

		addResult({
			rawMatch,
			displayText: restoredCollapsedUnc ? `<${normalized.normalizedPath}>` : rawMatch,
			normalizedPath: normalized.normalizedPath,
			start,
			end: start + rawMatch.length,
			kind: normalized.kind,
			isQuoted: false,
			isAngleBracketed: true,
		});
	}

	// 3. Double-quoted Windows paths (e.g., Explorer "Copy as path"): "C:\Program Files\..."
	const quotedRegex = /"([a-zA-Z]:\\[^"\r\n]+|\\\\?[a-zA-Z0-9._-]+\\[^"\r\n]+)"/g;
	for (const match of text.matchAll(quotedRegex)) {
		const start = match.index ?? -1;
		if (start < 0) {
			continue;
		}
		const rawMatch = match[0];
		const inner = match[1];
		const normalized = normalizeWindowsPath(inner, options);
		if (!normalized) {
			continue;
		}
		const restoredCollapsedUnc =
			normalized.kind === "unc" && inner.startsWith("\\") && !inner.startsWith("\\\\");

		addResult({
			rawMatch,
			displayText: restoredCollapsedUnc ? `"${normalized.normalizedPath}"` : rawMatch,
			normalizedPath: normalized.normalizedPath,
			start,
			end: start + rawMatch.length,
			kind: normalized.kind,
			isQuoted: true,
			isAngleBracketed: false,
		});
	}

	// 4. Unquoted local drive and UNC paths
	const unquotedLocalAndUncRegex =
		/(?:^|(?<=[\s(["'=<|>]))((?:[a-zA-Z]:\\|\\\\[a-zA-Z0-9._-]+\\)[^\s\\/:*?"<>|]*(?:\\[^\s\\/:*?"<>|]*)*)/g;
	collectUnquotedMatches(text, unquotedLocalAndUncRegex, options, addResult);

	// 5. Reading View fallback for CommonMark-collapsed single-backslash UNC paths (\server\share)
	if (allowCollapsedUnc) {
		const collapsedUncRegex =
			/(?:^|(?<=[\s(["'=<|>]))(\\[a-zA-Z0-9._-]+\\[^\s\\/:*?"<>|]+(?:\\[^\s\\/:*?"<>|]*)*)/g;
		collectUnquotedMatches(text, collapsedUncRegex, options, addResult);
	}

	results.sort((a, b) => a.start - b.start);
	return results;
}

function collectUnquotedMatches(
	text: string,
	regex: RegExp,
	options: DetectWindowsPathsOptions,
	addResult: (entry: DetectedWindowsPath) => void,
): void {
	for (const match of text.matchAll(regex)) {
		const start = match.index ?? -1;
		if (start < 0) {
			continue;
		}
		const cleaned = trimTrailingPunctuation(match[1]);
		if (cleaned.length === 0) {
			continue;
		}
		const normalized = normalizeWindowsPath(cleaned, options);
		if (!normalized) {
			continue;
		}

		const restoredCollapsedUnc =
			normalized.kind === "unc" && cleaned.startsWith("\\") && !cleaned.startsWith("\\\\");

		addResult({
			rawMatch: cleaned,
			displayText: restoredCollapsedUnc ? normalized.normalizedPath : cleaned,
			normalizedPath: normalized.normalizedPath,
			start,
			end: start + cleaned.length,
			kind: normalized.kind,
			isQuoted: false,
			isAngleBracketed: false,
		});
	}
}
