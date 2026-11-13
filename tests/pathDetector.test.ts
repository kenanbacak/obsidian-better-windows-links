import { describe, expect, it } from "vitest";
import {
	detectWindowsPaths,
	findPathAtOffset,
	normalizeWindowsPath,
} from "../src/pathDetector";

describe("detectWindowsPaths", () => {
	it("detects unquoted local drive paths", () => {
		const text = "Open C:\\Users\\Kenan\\Notes\\todo.txt or D:\\Projects\\";
		const matches = detectWindowsPaths(text);

		expect(matches).toHaveLength(2);
		expect(matches[0]).toMatchObject({
			rawMatch: "C:\\Users\\Kenan\\Notes\\todo.txt",
			normalizedPath: "C:\\Users\\Kenan\\Notes\\todo.txt",
			kind: "local",
			isQuoted: false,
		});
		expect(matches[1]).toMatchObject({
			rawMatch: "D:\\Projects\\",
			normalizedPath: "D:\\Projects\\",
			kind: "local",
			isQuoted: false,
		});
	});

	it("detects UNC network paths including IP-based hosts", () => {
		const text = "Docs at \\\\fileserver\\shared\\docs\\report.pdf and \\\\192.168.1.50\\public";
		const matches = detectWindowsPaths(text);

		expect(matches).toHaveLength(2);
		expect(matches[0]).toMatchObject({
			rawMatch: "\\\\fileserver\\shared\\docs\\report.pdf",
			normalizedPath: "\\\\fileserver\\shared\\docs\\report.pdf",
			kind: "unc",
			isQuoted: false,
		});
		expect(matches[1]).toMatchObject({
			rawMatch: "\\\\192.168.1.50\\public",
			normalizedPath: "\\\\192.168.1.50\\public",
			kind: "unc",
			isQuoted: false,
		});
	});

	it("detects double-quoted local and UNC paths with spaces (Copy as path format)", () => {
		const text =
			'Run "C:\\Program Files\\My App\\app.exe" and check "\\\\server\\Shared Folder\\Q1 Report.xlsx".';
		const matches = detectWindowsPaths(text);

		expect(matches).toHaveLength(2);
		expect(matches[0]).toMatchObject({
			rawMatch: '"C:\\Program Files\\My App\\app.exe"',
			normalizedPath: "C:\\Program Files\\My App\\app.exe",
			kind: "local",
			isQuoted: true,
		});
		expect(matches[1]).toMatchObject({
			rawMatch: '"\\\\server\\Shared Folder\\Q1 Report.xlsx"',
			normalizedPath: "\\\\server\\Shared Folder\\Q1 Report.xlsx",
			kind: "unc",
			isQuoted: true,
		});
	});

	it("detects angle-bracketed paths with spaces", () => {
		const text = "See <C:\\My Documents\\file name.txt> and <\\\\nas\\Team Share\\notes.md>";
		const matches = detectWindowsPaths(text);

		expect(matches).toHaveLength(2);
		expect(matches[0]).toMatchObject({
			rawMatch: "<C:\\My Documents\\file name.txt>",
			normalizedPath: "C:\\My Documents\\file name.txt",
			kind: "local",
		});
		expect(matches[1]).toMatchObject({
			rawMatch: "<\\\\nas\\Team Share\\notes.md>",
			normalizedPath: "\\\\nas\\Team Share\\notes.md",
			kind: "unc",
		});
	});

	it("detects Markdown links with Windows and UNC targets", () => {
		const text =
			"Open [Project Folder](C:\\Projects\\MyApp) or [Share](<\\\\server\\Shared Folder\\doc.pdf>)";
		const matches = detectWindowsPaths(text);

		expect(matches).toHaveLength(2);
		expect(matches[0]).toMatchObject({
			rawMatch: "[Project Folder](C:\\Projects\\MyApp)",
			displayText: "Project Folder",
			normalizedPath: "C:\\Projects\\MyApp",
			kind: "local",
		});
		expect(matches[1]).toMatchObject({
			rawMatch: "[Share](<\\\\server\\Shared Folder\\doc.pdf>)",
			displayText: "Share",
			normalizedPath: "\\\\server\\Shared Folder\\doc.pdf",
			kind: "unc",
		});
	});

	it("preserves balanced parentheses while stripping wrapping parentheses", () => {
		const text =
			'Check "C:\\Program Files (x86)\\Steam\\steam.exe", (C:\\Apps\\Tool(x86)\\run.exe), and (see C:\\Logs\\app.log).';
		const matches = detectWindowsPaths(text);

		expect(matches).toHaveLength(3);
		expect(matches[0].normalizedPath).toBe("C:\\Program Files (x86)\\Steam\\steam.exe");
		expect(matches[1].normalizedPath).toBe("C:\\Apps\\Tool(x86)\\run.exe");
		expect(matches[2].normalizedPath).toBe("C:\\Logs\\app.log");
	});

	it("strips trailing sentence punctuation from unquoted paths", () => {
		const text = "Check C:\\temp\\log.txt, then \\\\server\\share\\file.doc.";
		const matches = detectWindowsPaths(text);

		expect(matches).toHaveLength(2);
		expect(matches[0].normalizedPath).toBe("C:\\temp\\log.txt");
		expect(matches[1].normalizedPath).toBe("\\\\server\\share\\file.doc");
	});

	it("supports non-ASCII Unicode characters in paths", () => {
		const text = "Belge: C:\\Klasör\\Çalışma_Özeti.docx ve \\\\sunucu\\Arşiv\\2026_Rapor.pdf";
		const matches = detectWindowsPaths(text);

		expect(matches).toHaveLength(2);
		expect(matches[0].normalizedPath).toBe("C:\\Klasör\\Çalışma_Özeti.docx");
		expect(matches[1].normalizedPath).toBe("\\\\sunucu\\Arşiv\\2026_Rapor.pdf");
	});

	it("restores CommonMark-collapsed single-backslash UNC paths when enabled", () => {
		const collapsedText = "Share at \\server\\share\\folder and \"\\nas\\Team Docs\\spec.pdf\"";

		expect(detectWindowsPaths(collapsedText)).toHaveLength(0);

		const restored = detectWindowsPaths(collapsedText, {
			allowCollapsedUncPrefix: true,
		});
		expect(restored).toHaveLength(2);
		expect(restored[0]).toMatchObject({
			rawMatch: "\\server\\share\\folder",
			normalizedPath: "\\\\server\\share\\folder",
			kind: "unc",
		});
		expect(restored[1]).toMatchObject({
			rawMatch: '"\\nas\\Team Docs\\spec.pdf"',
			normalizedPath: "\\\\nas\\Team Docs\\spec.pdf",
			kind: "unc",
			isQuoted: true,
		});
	});

	it("ignores web URLs and Markdown image embeds", () => {
		const text =
			"Visit https://example.com/C:/path and [Site](https://example.com) and ![img](C:\\images\\pic.png)";
		const matches = detectWindowsPaths(text);

		expect(matches).toHaveLength(0);
	});

	it("detects paths inside Markdown table cells and blockquotes", () => {
		const text = ">C:\\Logs\\quote.log\n| File |C:\\Data\\sheet.xlsx|";
		const matches = detectWindowsPaths(text);

		expect(matches).toHaveLength(2);
		expect(matches[0].normalizedPath).toBe("C:\\Logs\\quote.log");
		expect(matches[1].normalizedPath).toBe("C:\\Data\\sheet.xlsx");
	});
});

describe("normalizeWindowsPath", () => {
	it("normalizes drive roots and rejects invalid UNC paths", () => {
		expect(normalizeWindowsPath("C:\\")).toEqual({
			normalizedPath: "C:\\",
			kind: "local",
		});
		expect(normalizeWindowsPath("\\\\onlyserver")).toBeNull();
		expect(normalizeWindowsPath("https://obsidian.md")).toBeNull();
	});
});

describe("findPathAtOffset", () => {
	it("finds the path covering a cursor offset", () => {
		const line = "Open C:\\Users\\Kenan\\notes.txt in editor";
		const match = findPathAtOffset(line, 10);
		expect(match?.normalizedPath).toBe("C:\\Users\\Kenan\\notes.txt");
		expect(findPathAtOffset(line, 0)).toBeNull();
	});
});
