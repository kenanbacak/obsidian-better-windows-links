import { execFile } from "child_process";
import { shell } from "electron";
import { promises as fsPromises } from "fs";
import { App, Menu, Modal, Notice, Platform, Setting } from "obsidian";
import { isExecutableWindowsPath, normalizeWindowsPath, WindowsPathKind } from "./pathDetector";
import { WindowsLinksSettings } from "./settings";

export interface PathActionContext {
	app: App;
	settings: Pick<WindowsLinksSettings, "confirmExecutablePaths" | "confirmUncPaths">;
}

type ConfirmDecision = "open" | "reveal" | "cancel";

interface ConfirmModalOptions {
	title: string;
	message: string;
	targetPath: string;
	confirmLabel: string;
	confirmStyle: "warning" | "cta";
	allowReveal: boolean;
}

const UNC_SHARE_ROOT_PATTERN = /^\\\\[^\\]+\\[^\\]+\\?$/;

class ConfirmPathOpenModal extends Modal {
	private readonly options: ConfirmModalOptions;
	private readonly resolveDecision: (decision: ConfirmDecision) => void;
	private settled = false;

	constructor(
		app: App,
		options: ConfirmModalOptions,
		resolveDecision: (decision: ConfirmDecision) => void,
	) {
		super(app);
		this.options = options;
		this.resolveDecision = resolveDecision;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle(this.options.title);

		contentEl.createEl("p", { text: this.options.message });

		const pathBox = contentEl.createEl("div", { cls: "windows-links-modal-path" });
		pathBox.createEl("code", { text: this.options.targetPath });

		const buttonBar = new Setting(contentEl);

		if (this.options.allowReveal) {
			buttonBar.addButton((btn) =>
				btn.setButtonText("Reveal in file explorer").onClick(() => {
					this.finish("reveal");
				}),
			);
		}

		buttonBar.addButton((btn) =>
			btn.setButtonText("Cancel").onClick(() => {
				this.finish("cancel");
			}),
		);

		buttonBar.addButton((btn) => {
			btn.setButtonText(this.options.confirmLabel);
			if (this.options.confirmStyle === "warning") {
				btn.setWarning();
			} else {
				btn.setCta();
			}
			btn.onClick(() => {
				this.finish("open");
			});
		});
	}

	onClose(): void {
		if (!this.settled) {
			this.settled = true;
			this.resolveDecision("cancel");
		}
		this.contentEl.empty();
	}

	private finish(decision: ConfirmDecision): void {
		if (!this.settled) {
			this.settled = true;
			this.resolveDecision(decision);
		}
		this.close();
	}
}

function promptPathConfirmation(app: App, options: ConfirmModalOptions): Promise<ConfirmDecision> {
	return new Promise((resolve) => {
		const modal = new ConfirmPathOpenModal(app, options, resolve);
		modal.open();
	});
}

function validateTargetPath(
	rawPath: string,
): { normalizedPath: string; kind: WindowsPathKind } | null {
	return normalizeWindowsPath(rawPath, { allowCollapsedUncPrefix: true });
}

async function pathIsAccessible(targetPath: string): Promise<boolean> {
	try {
		await fsPromises.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function isDirectoryPath(targetPath: string): Promise<boolean> {
	try {
		const stats = await fsPromises.stat(targetPath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

function launchExplorer(args: string[]): void {
	execFile("explorer.exe", args, () => {
		// explorer.exe frequently exits with code 1 when delegating to an existing
		// Explorer instance, so non-zero exit codes do not indicate failure.
	});
}

async function confirmUncAccessIfNeeded(
	targetPath: string,
	kind: WindowsPathKind,
	context: PathActionContext,
): Promise<boolean> {
	if (kind !== "unc" || !context.settings.confirmUncPaths) {
		return true;
	}
	const decision = await promptPathConfirmation(context.app, {
		title: "Open network path?",
		message:
			"This link points to a remote UNC network path. Connecting to untrusted servers may expose network credentials:",
		targetPath,
		confirmLabel: "Open path",
		confirmStyle: "cta",
		allowReveal: false,
	});
	return decision === "open";
}

async function revealValidatedPath(
	targetPath: string,
	kind: WindowsPathKind,
	context: PathActionContext,
): Promise<void> {
	const uncConfirmed = await confirmUncAccessIfNeeded(targetPath, kind, context);
	if (!uncConfirmed) {
		return;
	}

	const exists = await pathIsAccessible(targetPath);
	if (!exists) {
		new Notice(`Path not found or unreachable: ${targetPath}`);
		return;
	}

	// explorer.exe parses commas in command-line arguments as parameter separators;
	// fall back to Electron's showItemInFolder when the path contains a comma.
	if (Platform.isWin && !targetPath.includes(",")) {
		launchExplorer([`/select,${targetPath}`]);
		return;
	}

	shell.showItemInFolder(targetPath);
}

/**
 * Opens a local Windows file/folder or UNC network path using the default
 * Windows application or file explorer, prompting before risky actions.
 */
export async function openWindowsPath(
	rawPath: string,
	context: PathActionContext,
): Promise<void> {
	const validated = validateTargetPath(rawPath);
	if (!validated) {
		new Notice("Invalid or unsupported Windows path.");
		return;
	}
	const { normalizedPath: targetPath, kind } = validated;

	if (!Platform.isDesktopApp) {
		new Notice("Windows link opening is only available on the desktop app.");
		return;
	}

	// Prompt before touching the filesystem or network so unconfirmed UNC paths
	// never trigger automatic SMB / Net-NTLMv2 authentication attempts.
	if (isExecutableWindowsPath(targetPath) && context.settings.confirmExecutablePaths) {
		const decision = await promptPathConfirmation(context.app, {
			title: "Open executable file?",
			message:
				"This link points to an executable, script, or shortcut file that may run code on your computer:",
			targetPath,
			confirmLabel: "Run file",
			confirmStyle: "warning",
			allowReveal: true,
		});
		if (decision === "cancel") {
			return;
		}
		if (decision === "reveal") {
			await revealValidatedPath(targetPath, kind, context);
			return;
		}
	} else {
		const uncConfirmed = await confirmUncAccessIfNeeded(targetPath, kind, context);
		if (!uncConfirmed) {
			return;
		}
	}

	if (Platform.isWin && !targetPath.includes(",")) {
		const isDirectory = await isDirectoryPath(targetPath);
		if (isDirectory) {
			launchExplorer([targetPath]);
			return;
		}
	}

	const errorMessage = await shell.openPath(targetPath);
	if (!errorMessage) {
		return;
	}

	// Fallback for UNC share roots where stat/openPath can report an error
	// even when file explorer can browse them directly.
	if (Platform.isWin && UNC_SHARE_ROOT_PATTERN.test(targetPath) && !targetPath.includes(",")) {
		const accessible = await pathIsAccessible(targetPath);
		if (accessible) {
			launchExplorer([targetPath]);
			return;
		}
	}

	new Notice(`Could not open path: ${errorMessage}`);
}

/**
 * Opens file explorer in the foreground and selects the target file or folder.
 */
export async function revealWindowsPathInExplorer(
	rawPath: string,
	context: PathActionContext,
): Promise<void> {
	const validated = validateTargetPath(rawPath);
	if (!validated) {
		new Notice("Invalid or unsupported Windows path.");
		return;
	}

	if (!Platform.isDesktopApp) {
		new Notice("File explorer integration is only available on the desktop app.");
		return;
	}

	await revealValidatedPath(validated.normalizedPath, validated.kind, context);
}

/**
 * Copies the validated Windows path to the system clipboard.
 */
export async function copyWindowsPath(rawPath: string): Promise<void> {
	const validated = validateTargetPath(rawPath);
	if (!validated) {
		new Notice("Invalid or unsupported Windows path.");
		return;
	}

	try {
		await navigator.clipboard.writeText(validated.normalizedPath);
		new Notice("Path copied to clipboard.");
	} catch {
		new Notice("Could not copy path to clipboard.");
	}
}

/**
 * Displays the Obsidian context menu for a detected Windows or UNC path.
 */
export function showPathContextMenu(
	event: MouseEvent,
	rawPath: string,
	context: PathActionContext,
): void {
	const menu = new Menu();

	menu.addItem((item) =>
		item
			.setTitle("Open in default app")
			.setIcon("external-link")
			.onClick(() => {
				void openWindowsPath(rawPath, context);
			}),
	);

	menu.addItem((item) =>
		item
			.setTitle("Reveal in file explorer")
			.setIcon("folder-open")
			.onClick(() => {
				void revealWindowsPathInExplorer(rawPath, context);
			}),
	);

	menu.addSeparator();

	menu.addItem((item) =>
		item
			.setTitle("Copy path")
			.setIcon("copy")
			.onClick(() => {
				void copyWindowsPath(rawPath);
			}),
	);

	menu.showAtMouseEvent(event);
}
