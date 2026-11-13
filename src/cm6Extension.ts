import { syntaxTree } from "@codemirror/language";
import { Extension, RangeSetBuilder } from "@codemirror/state";
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

function buildDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
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
						const decoration = Decoration.mark({
							class: "windows-links-path",
							attributes: {
								"data-win-path": match.normalizedPath,
								"aria-label": match.normalizedPath,
							},
						});
						builder.add(matchFrom, matchTo, decoration);
					}
				}
			}

			if (line.to >= visibleRange.to) {
				break;
			}
			pos = line.to + 1;
		}
	}

	return builder.finish();
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
