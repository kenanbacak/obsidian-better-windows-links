import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shell } from "electron";
import { App, Platform } from "obsidian";
import {
	copyWindowsPath,
	openWindowsPath,
	PathActionContext,
	revealWindowsPathInExplorer,
	showPathContextMenu,
} from "../src/opener";
import { DEFAULT_SETTINGS } from "../src/settings";
import { mockState, Setting } from "./mocks/obsidian";

const { mockExecFile, mockStat, mockAccess } = vi.hoisted(() => ({
	mockExecFile: vi.fn(
		(_file: string, _args: string[], cb?: (error: Error | null) => void) => {
			if (cb) {
				cb(null);
			}
		},
	),
	mockStat: vi.fn(
		async (_targetPath: string): Promise<{ isDirectory: () => boolean }> => ({
			isDirectory: () => false,
		}),
	),
	mockAccess: vi.fn(async (_targetPath: string): Promise<void> => {}),
}));

vi.mock("child_process", () => ({
	execFile: mockExecFile,
}));

vi.mock("fs", () => ({
	promises: {
		stat: mockStat,
		access: mockAccess,
	},
}));

function createContext(
	overrides: Partial<PathActionContext["settings"]> = {},
): PathActionContext {
	return {
		app: new App() as unknown as PathActionContext["app"],
		settings: {
			confirmExecutablePaths:
				overrides.confirmExecutablePaths ?? DEFAULT_SETTINGS.confirmExecutablePaths,
			confirmUncPaths: overrides.confirmUncPaths ?? DEFAULT_SETTINGS.confirmUncPaths,
		},
	};
}

describe("opener", () => {
	let clipboardWriteText: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockState.reset();
		Setting.instances = [];
		vi.clearAllMocks();
		mockStat.mockResolvedValue({ isDirectory: () => false });
		mockAccess.mockResolvedValue(undefined);
		vi.mocked(shell.openPath).mockResolvedValue("");

		clipboardWriteText = vi.fn(async () => {});
		vi.stubGlobal("navigator", {
			clipboard: { writeText: clipboardWriteText },
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("validation & platform guards", () => {
		it("rejects invalid, traversal, and device paths without touching fs or shell", async () => {
			const ctx = createContext();

			for (const bad of [
				"https://evil.com",
				"javascript:alert(1)",
				"\\\\.\\PhysicalDrive0",
				"C:\\Safe\\..\\Windows\\cmd.exe",
			]) {
				await openWindowsPath(bad, ctx);
				await revealWindowsPathInExplorer(bad, ctx);
				await copyWindowsPath(bad);
			}

			expect(mockStat).not.toHaveBeenCalled();
			expect(mockAccess).not.toHaveBeenCalled();
			expect(mockExecFile).not.toHaveBeenCalled();
			expect(shell.openPath).not.toHaveBeenCalled();
			expect(shell.showItemInFolder).not.toHaveBeenCalled();
			expect(clipboardWriteText).not.toHaveBeenCalled();
			expect(mockState.notices.every((n) => n.message === "Invalid or unsupported Windows path.")).toBe(
				true,
			);
		});

		it("aborts with a notice when not running on desktop app", async () => {
			Platform.isDesktopApp = false;
			const ctx = createContext();

			await openWindowsPath("C:\\Docs\\report.pdf", ctx);
			await revealWindowsPathInExplorer("C:\\Docs\\report.pdf", ctx);

			expect(shell.openPath).not.toHaveBeenCalled();
			expect(mockExecFile).not.toHaveBeenCalled();
			expect(mockState.notices.map((n) => n.message)).toEqual([
				"Windows link opening is only available on the desktop app.",
				"File explorer integration is only available on the desktop app.",
			]);
		});
	});

	describe("openWindowsPath", () => {
		it("opens regular files with shell.openPath", async () => {
			await openWindowsPath("C:\\Docs\\report.pdf", createContext());

			expect(mockStat).toHaveBeenCalledWith("C:\\Docs\\report.pdf");
			expect(shell.openPath).toHaveBeenCalledWith("C:\\Docs\\report.pdf");
			expect(mockExecFile).not.toHaveBeenCalled();
		});

		it("opens directories in foreground via explorer.exe when path has no commas", async () => {
			mockStat.mockResolvedValue({ isDirectory: () => true });

			await openWindowsPath('"C:\\My Projects\\Obsidian"', createContext());

			expect(mockExecFile).toHaveBeenCalledWith(
				"explorer.exe",
				["C:\\My Projects\\Obsidian"],
				expect.any(Function),
			);
			expect(shell.openPath).not.toHaveBeenCalled();
		});

		it("falls back to shell.openPath for directories containing commas", async () => {
			mockStat.mockResolvedValue({ isDirectory: () => true });

			await openWindowsPath("C:\\Clients\\Acme, Inc", createContext());

			expect(mockExecFile).not.toHaveBeenCalled();
			expect(shell.openPath).toHaveBeenCalledWith("C:\\Clients\\Acme, Inc");
		});

		it("falls back to explorer.exe on accessible UNC share roots when shell.openPath returns an error", async () => {
			vi.mocked(shell.openPath).mockResolvedValue("Failed to open path");

			await openWindowsPath("\\\\localhost\\c$", createContext());

			expect(mockAccess).toHaveBeenCalledWith("\\\\localhost\\c$");
			expect(mockExecFile).toHaveBeenCalledWith(
				"explorer.exe",
				["\\\\localhost\\c$"],
				expect.any(Function),
			);
			expect(mockState.notices).toHaveLength(0);
		});

		it("shows a notice when shell.openPath fails on a missing local file", async () => {
			vi.mocked(shell.openPath).mockResolvedValue("File not found");

			await openWindowsPath("C:\\Missing\\file.pdf", createContext());

			expect(mockState.notices).toEqual([{ message: "Could not open path: File not found" }]);
		});
	});

	describe("executable and UNC confirmation modals", () => {
		it("cancels executable launch when Cancel is clicked", async () => {
			mockState.onModalOpened = (modal) => {
				expect(modal.title).toBe("Open executable file?");
				expect(modal.codeTexts).toEqual(["C:\\Windows\\notepad.exe"]);
				modal.buttons.find((b) => b.text === "Cancel")?.trigger();
			};

			await openWindowsPath("C:\\Windows\\notepad.exe", createContext({ confirmExecutablePaths: true }));

			expect(shell.openPath).not.toHaveBeenCalled();
			expect(mockExecFile).not.toHaveBeenCalled();
		});

		it("cancels executable launch when modal is dismissed via Escape/close", async () => {
			mockState.onModalOpened = (modal) => {
				modal.close();
			};

			await openWindowsPath("C:\\Scripts\\run.ps1", createContext({ confirmExecutablePaths: true }));

			expect(shell.openPath).not.toHaveBeenCalled();
		});

		it("launches executable when Run file is clicked", async () => {
			mockState.onModalOpened = (modal) => {
				modal.buttons.find((b) => b.text === "Run file")?.trigger();
			};

			await openWindowsPath("C:\\Temp\\setup.exe.. ", createContext({ confirmExecutablePaths: true }));

			expect(shell.openPath).toHaveBeenCalledWith("C:\\Temp\\setup.exe..");
		});

		it("reveals executable in File Explorer when Reveal in file explorer is clicked in modal", async () => {
			mockState.onModalOpened = (modal) => {
				modal.buttons.find((b) => b.text === "Reveal in file explorer")?.trigger();
			};

			await openWindowsPath("C:\\Temp\\tool.bat", createContext({ confirmExecutablePaths: true }));

			expect(shell.openPath).not.toHaveBeenCalled();
			expect(mockExecFile).toHaveBeenCalledWith(
				"explorer.exe",
				["/select,C:\\Temp\\tool.bat"],
				expect.any(Function),
			);
		});

		it("opens executable directly without modal when confirmExecutablePaths is disabled", async () => {
			await openWindowsPath(
				"C:\\Windows\\notepad.exe",
				createContext({ confirmExecutablePaths: false }),
			);

			expect(mockState.lastModal).toBeNull();
			expect(shell.openPath).toHaveBeenCalledWith("C:\\Windows\\notepad.exe");
		});

		it("prompts before accessing UNC paths when confirmUncPaths is enabled and prevents SMB access on Cancel", async () => {
			mockState.onModalOpened = (modal) => {
				expect(modal.title).toBe("Open network path?");
				expect(modal.codeTexts).toEqual(["\\\\untrusted\\share\\doc.pdf"]);
				modal.buttons.find((b) => b.text === "Cancel")?.trigger();
			};

			await openWindowsPath(
				"\\untrusted\\share\\doc.pdf",
				createContext({ confirmUncPaths: true }),
			);

			expect(mockStat).not.toHaveBeenCalled();
			expect(mockAccess).not.toHaveBeenCalled();
			expect(shell.openPath).not.toHaveBeenCalled();
		});

		it("opens UNC path after user confirms Open path", async () => {
			mockState.onModalOpened = (modal) => {
				modal.buttons.find((b) => b.text === "Open path")?.trigger();
			};

			await openWindowsPath(
				"\\\\fileserver\\shared\\doc.pdf",
				createContext({ confirmUncPaths: true }),
			);

			expect(shell.openPath).toHaveBeenCalledWith("\\\\fileserver\\shared\\doc.pdf");
		});
	});

	describe("revealWindowsPathInExplorer", () => {
		it("launches explorer.exe /select,path when target is accessible", async () => {
			await revealWindowsPathInExplorer("C:\\Docs\\notes.txt", createContext());

			expect(mockAccess).toHaveBeenCalledWith("C:\\Docs\\notes.txt");
			expect(mockExecFile).toHaveBeenCalledWith(
				"explorer.exe",
				["/select,C:\\Docs\\notes.txt"],
				expect.any(Function),
			);
		});

		it("uses shell.showItemInFolder when path contains a comma", async () => {
			await revealWindowsPathInExplorer("C:\\Docs\\Report, Final.pdf", createContext());

			expect(mockExecFile).not.toHaveBeenCalled();
			expect(shell.showItemInFolder).toHaveBeenCalledWith("C:\\Docs\\Report, Final.pdf");
		});

		it("shows a notice when target does not exist", async () => {
			mockAccess.mockRejectedValue(new Error("ENOENT"));

			await revealWindowsPathInExplorer("C:\\Docs\\missing.txt", createContext());

			expect(mockExecFile).not.toHaveBeenCalled();
			expect(shell.showItemInFolder).not.toHaveBeenCalled();
			expect(mockState.notices).toEqual([
				{ message: "Path not found or unreachable: C:\\Docs\\missing.txt" },
			]);
		});

		it("aborts UNC reveal before fs.access when confirmUncPaths modal is canceled", async () => {
			mockState.onModalOpened = (modal) => {
				modal.buttons.find((b) => b.text === "Cancel")?.trigger();
			};

			await revealWindowsPathInExplorer(
				"\\\\fileserver\\share\\doc.pdf",
				createContext({ confirmUncPaths: true }),
			);

			expect(mockAccess).not.toHaveBeenCalled();
			expect(mockExecFile).not.toHaveBeenCalled();
		});
	});

	describe("copyWindowsPath & showPathContextMenu", () => {
		it("copies normalized Windows/UNC paths and shows success notice", async () => {
			await copyWindowsPath("\\localhost\\c$\\Windows");

			expect(clipboardWriteText).toHaveBeenCalledWith("\\\\localhost\\c$\\Windows");
			expect(mockState.notices).toEqual([{ message: "Path copied to clipboard." }]);
		});

		it("shows an error notice when clipboard write rejects", async () => {
			clipboardWriteText.mockRejectedValue(new Error("Clipboard denied"));

			await copyWindowsPath("C:\\Docs\\a.txt");

			expect(mockState.notices).toEqual([{ message: "Could not copy path to clipboard." }]);
		});

		it("displays context menu with 3 actions and executes clicked item", async () => {
			showPathContextMenu({} as MouseEvent, "C:\\Docs\\a.txt", createContext());

			expect(mockState.menuShownCount).toBe(1);
			expect(mockState.menuItems.map((i) => i.title)).toEqual([
				"Open in default app",
				"Reveal in file explorer",
				"Copy path",
			]);

			mockState.menuItems[2].callback();
			await Promise.resolve();

			expect(clipboardWriteText).toHaveBeenCalledWith("C:\\Docs\\a.txt");
		});
	});
});
