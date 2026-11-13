import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { createWindowsLinksEditorExtension } from "./cm6Extension";
import {
	copyWindowsPath,
	openWindowsPath,
	revealWindowsPathInExplorer,
	showPathContextMenu,
} from "./opener";
import { detectWindowsPaths, findPathAtOffset } from "./pathDetector";
import { processReadingViewLinks } from "./postProcessor";
import { DEFAULT_SETTINGS, WindowsLinksSettings, WindowsLinksSettingTab } from "./settings";

const SHOW_ICON_BODY_CLASS = "windows-links-show-icons";
const HIDE_DELIMITERS_BODY_CLASS = "windows-links-hide-delimiters";

export default class WindowsLinksPlugin extends Plugin {
	settings: WindowsLinksSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();
		this.syncBodyClasses();

		this.addSettingTab(new WindowsLinksSettingTab(this.app, this));
		this.registerEditorExtension(createWindowsLinksEditorExtension());
		this.registerMarkdownPostProcessor((el, ctx) => {
			processReadingViewLinks(el, ctx);
		});

		this.registerDomEvent(
			document,
			"click",
			(evt: MouseEvent) => {
				this.handlePathClick(evt);
			},
			true,
		);

		this.registerDomEvent(
			document,
			"contextmenu",
			(evt: MouseEvent) => {
				this.handlePathContextMenu(evt);
			},
			true,
		);

		this.addCommand({
			id: "open-path-at-cursor",
			name: "Open path under cursor",
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) {
					return false;
				}
				if (!checking) {
					this.runLinePathAction(view.editor, (path) => {
						void openWindowsPath(path);
					});
				}
				return true;
			},
		});

		this.addCommand({
			id: "reveal-path-at-cursor",
			name: "Reveal path under cursor in File Explorer",
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) {
					return false;
				}
				if (!checking) {
					this.runLinePathAction(view.editor, (path) => {
						void revealWindowsPathInExplorer(path);
					});
				}
				return true;
			},
		});

		this.addCommand({
			id: "copy-path-at-cursor",
			name: "Copy path under cursor",
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) {
					return false;
				}
				if (!checking) {
					this.runLinePathAction(view.editor, (path) => {
						void copyWindowsPath(path);
					});
				}
				return true;
			},
		});
	}

	onunload(): void {
		document.body.classList.remove(SHOW_ICON_BODY_CLASS, HIDE_DELIMITERS_BODY_CLASS);
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<WindowsLinksSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...loaded };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.syncBodyClasses();
	}

	private syncBodyClasses(): void {
		document.body.classList.toggle(SHOW_ICON_BODY_CLASS, this.settings.showFolderIcon);
		document.body.classList.toggle(
			HIDE_DELIMITERS_BODY_CLASS,
			this.settings.stripQuotesInReadingView,
		);
	}

	private getPathAtCursor(editor: Editor): string | null {
		const cursor = editor.getCursor();
		const lineText = editor.getLine(cursor.line);
		const exactMatch = findPathAtOffset(lineText, cursor.ch);
		if (exactMatch) {
			return exactMatch.normalizedPath;
		}
		const lineMatches = detectWindowsPaths(lineText);
		return lineMatches[0]?.normalizedPath ?? null;
	}

	private runLinePathAction(editor: Editor, action: (path: string) => void): void {
		const path = this.getPathAtCursor(editor);
		if (!path) {
			new Notice("No Windows or UNC path found on the current line.");
			return;
		}
		action(path);
	}

	private findTargetPathElement(evt: MouseEvent): HTMLElement | null {
		if (!(evt.target instanceof HTMLElement)) {
			return null;
		}
		return evt.target.closest<HTMLElement>(".windows-links-path");
	}

	private handlePathClick(evt: MouseEvent): void {
		if (evt.button !== 0) {
			return;
		}
		const linkEl = this.findTargetPathElement(evt);
		if (!linkEl) {
			return;
		}
		const winPath = linkEl.dataset.winPath;
		if (!winPath) {
			return;
		}

		// Preserve drag-to-select behavior when the user selects text across a path.
		const selection = window.getSelection();
		if (selection && !selection.isCollapsed) {
			return;
		}

		const isInsideEditor = linkEl.closest(".cm-editor") !== null;
		if (isInsideEditor && this.settings.requireCtrlClickInEditor && !evt.ctrlKey && !evt.metaKey) {
			return;
		}

		evt.preventDefault();
		evt.stopPropagation();
		void openWindowsPath(winPath);
	}

	private handlePathContextMenu(evt: MouseEvent): void {
		const linkEl = this.findTargetPathElement(evt);
		if (!linkEl) {
			return;
		}
		const winPath = linkEl.dataset.winPath;
		if (!winPath) {
			return;
		}

		evt.preventDefault();
		evt.stopPropagation();
		showPathContextMenu(evt, winPath);
	}
}
