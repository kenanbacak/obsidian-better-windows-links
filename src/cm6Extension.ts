import { syntaxTree } from "@codemirror/language";
import { Extension, Range } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { detectWindowsPaths } from "./pathDetector";

interface CodeRange {
	from: number;
	to: number;
}

function getCodeRangesInSpan(view: EditorView, from: number, to: number): CodeRange[] {
	const ranges: CodeRange[] = [];
	const tree = syntaxTree(view.state);

	tree.iterate({
		from,
		to,
		enter(node) {
			const name = node.name.toLowerCase();
			if (name.includes("code")) {
				ranges.push({ from: node.from, to: node.to });
				return false;
			}
		},
	});

	return ranges;
}

function overlapsCodeRange(ranges: readonly CodeRange[], start: number, end: number): boolean {
	for (const range of ranges) {
		if (start < range.to && end > range.from) {
			return true;
		}
	}
	return false;
}

function selectionOverlapsRange(view: EditorView, from: number, to: number): boolean {
	for (const range of view.state.selection.ranges) {
		if (range.from <= to && range.to >= from) {
			return true;
		}
	}
	return false;
}

function buildDecorations(view: EditorView): DecorationSet {
	const decorations: Range<Decoration>[] = [];
	let lastProcessedLine = -1;

	for (const visibleRange of view.visibleRanges) {
		const codeRanges = getCodeRangesInSpan(view, visibleRange.from, visibleRange.to);
		let pos = visibleRange.from;

		while (pos <= visibleRange.to) {
			const line = view.state.doc.lineAt(pos);
			if (line.number > lastProcessedLine) {
				lastProcessedLine = line.number;

				if (line.text.length > 0) {
					const matches = detectWindowsPaths(line.text);
					for (const match of matches) {
						const matchFrom = line.from + match.start;
						const matchTo = line.from + match.end;
						if (matchFrom >= matchTo || overlapsCodeRange(codeRanges, matchFrom, matchTo)) {
							continue;
						}

						decorations.push(
							Decoration.mark({
								class: "windows-links-path",
								attributes: {
									"data-win-path": match.normalizedPath,
									"aria-label": match.normalizedPath,
								},
							}).range(matchFrom, matchTo),
						);

						// Restore the leading \\ visually in Live Preview when Obsidian's
						// Markdown escape hider collapses the first backslash.
						if (match.kind === "unc" && !match.rawMatch.startsWith("[")) {
							const uncRelIndex = match.rawMatch.indexOf("\\\\");
							if (uncRelIndex >= 0) {
								const uncPos = matchFrom + uncRelIndex;
								if (!selectionOverlapsRange(view, uncPos, uncPos + 2)) {
									decorations.push(
										Decoration.mark({
											class: "windows-links-unc-prefix",
										}).range(uncPos + 1, uncPos + 2),
									);
								}
							}
						}

						// Mark wrapping quotes ("...") or angle brackets (<...>) so the
						// user setting can hide them cleanly when the cursor is away.
						if (
							(match.isQuoted || match.isAngleBracketed) &&
							matchTo - matchFrom >= 2 &&
							!selectionOverlapsRange(view, matchFrom, matchTo)
						) {
							decorations.push(
								Decoration.mark({
									class: "windows-links-delimiter",
								}).range(matchFrom, matchFrom + 1),
							);
							decorations.push(
								Decoration.mark({
									class: "windows-links-delimiter",
								}).range(matchTo - 1, matchTo),
							);
						}
					}
				}
			}

			if (line.to >= visibleRange.to) {
				break;
			}
			pos = line.to + 1;
		}
	}

	return Decoration.set(decorations, true);
}

/**
 * Creates the CodeMirror 6 ViewPlugin extension that decorates local Windows
 * and UNC paths in Live Preview and source mode.
 */
export function createWindowsLinksEditorExtension(): Extension {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view);
			}

			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet ||
					syntaxTree(update.startState) !== syntaxTree(update.state)
				) {
					this.decorations = buildDecorations(update.view);
				}
			}
		},
		{
			decorations: (pluginInstance) => pluginInstance.decorations,
		},
	);
}
