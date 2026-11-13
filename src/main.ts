import { Plugin } from "obsidian";
import { createWindowsLinksEditorExtension } from "./cm6Extension";
import { openWindowsPath, showPathContextMenu } from "./opener";
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
		void openWindowsPath(winPath, { app: this.app, settings: this.settings });
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
		showPathContextMenu(evt, winPath, { app: this.app, settings: this.settings });
	}
}
