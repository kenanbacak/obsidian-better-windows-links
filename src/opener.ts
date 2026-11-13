import { execFile } from "child_process";
import { promises as fsPromises } from "fs";
import { Menu, Notice, Platform } from "obsidian";
import { normalizeWindowsPath } from "./pathDetector";

interface ElectronShell {
	openPath: (targetPath: string) => Promise<string>;
	showItemInFolder: (fullPath: string) => void;
}

interface ElectronModule {
	shell?: ElectronShell;
}

const UNC_SHARE_ROOT_PATTERN = /^\\\\[^\\]+\\[^\\]+\\?$/;

function getElectronShell(): ElectronShell | null {
	if (!Platform.isDesktopApp) {
		return null;
	}
	const electronWindow = window as unknown as {
		require?: (moduleId: string) => ElectronModule;
	};
	if (typeof electronWindow.require !== "function") {
		return null;
	}
	try {
		const electron = electronWindow.require("electron");
		return electron.shell ?? null;
	} catch {
		return null;
	}
}

function cleanTargetPath(rawPath: string): string {
	const normalized = normalizeWindowsPath(rawPath, { allowCollapsedUncPrefix: true });
	if (normalized) {
		return normalized.normalizedPath;
	}
	return rawPath.trim().replace(/^["<]+|[">]+$/g, "");
}

async function pathIsAccessible(targetPath: string): Promise<boolean> {
	try {
		await fsPromises.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

function openWithFileExplorer(targetPath: string): Promise<boolean> {
	return new Promise((resolve) => {
		execFile("explorer.exe", [targetPath], (error) => {
			resolve(error === null);
		});
	});
}

/**
 * Opens a local Windows file/folder or UNC network path using the default
 * Windows application or File Explorer.
 */
export async function openWindowsPath(rawPath: string): Promise<void> {
	const targetPath = cleanTargetPath(rawPath);
	const electronShell = getElectronShell();
	if (!electronShell) {
		new Notice("Windows link opening is only available on the desktop app.");
		return;
	}

	const errorMessage = await electronShell.openPath(targetPath);
	if (!errorMessage) {
		return;
	}

	// Electron's shell.openPath can return an error on certain UNC share roots
	// even when File Explorer can browse them directly.
	if (Platform.isWin && UNC_SHARE_ROOT_PATTERN.test(targetPath)) {
		const accessible = await pathIsAccessible(targetPath);
		if (accessible) {
			await openWithFileExplorer(targetPath);
			return;
		}
	}

	new Notice(`Could not open path: ${errorMessage}`);
}

/**
 * Opens File Explorer and selects the target file or folder.
 */
export async function revealWindowsPathInExplorer(rawPath: string): Promise<void> {
	const targetPath = cleanTargetPath(rawPath);
	const electronShell = getElectronShell();
	if (!electronShell) {
		new Notice("File Explorer integration is only available on the desktop app.");
		return;
	}

	const exists = await pathIsAccessible(targetPath);
	if (!exists) {
		new Notice(`Path not found or unreachable: ${targetPath}`);
		return;
	}

	electronShell.showItemInFolder(targetPath);
}

/**
 * Copies the normalized Windows path to the system clipboard.
 */
export async function copyWindowsPath(rawPath: string): Promise<void> {
	const targetPath = cleanTargetPath(rawPath);
	try {
		await navigator.clipboard.writeText(targetPath);
		new Notice("Path copied to clipboard.");
	} catch {
		new Notice("Could not copy path to clipboard.");
	}
}

/**
 * Displays the Obsidian context menu for a detected Windows or UNC path.
 */
export function showPathContextMenu(event: MouseEvent, rawPath: string): void {
	const menu = new Menu();

	menu.addItem((item) =>
		item
			.setTitle("Open in default app")
			.setIcon("external-link")
			.onClick(() => {
				void openWindowsPath(rawPath);
			}),
	);

	menu.addItem((item) =>
		item
			.setTitle("Reveal in File Explorer")
			.setIcon("folder-open")
			.onClick(() => {
				void revealWindowsPathInExplorer(rawPath);
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
