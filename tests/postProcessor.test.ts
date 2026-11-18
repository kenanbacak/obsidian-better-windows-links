import { beforeEach, describe, expect, it } from "vitest";
import { MarkdownPostProcessorContext } from "obsidian";
import { processReadingViewLinks } from "../src/postProcessor";
import { FakeElement, installFakeDomGlobals } from "./mocks/domShim";

function createContext(sectionText: string | null): MarkdownPostProcessorContext {
	return {
		getSectionInfo: () =>
			sectionText === null
				? null
				: {
						text: sectionText,
						lineStart: 0,
						lineEnd: sectionText.split("\n").length - 1,
					},
	} as unknown as MarkdownPostProcessorContext;
}

describe("processReadingViewLinks", () => {
	beforeEach(() => {
		installFakeDomGlobals();
	});

	it("converts plain local and UNC paths into interactive links with attributes", () => {
		const root = new FakeElement("div");
		const p = root.createEl("p");
		p.appendText("Open C:\\Docs\\report.pdf and \\\\fileserver\\share\\folder");

		processReadingViewLinks(
			root.asHtmlElement(),
			createContext("Open C:\\Docs\\report.pdf and \\\\fileserver\\share\\folder"),
		);

		const links = root.querySelectorAll("a");
		expect(links).toHaveLength(2);
		expect(links[0].classList.contains("windows-links-path")).toBe(true);
		expect(links[0].classList.contains("external-link")).toBe(true);
		expect(links[0].dataset.winPath).toBe("C:\\Docs\\report.pdf");
		expect(links[0].getAttribute("title")).toBe("C:\\Docs\\report.pdf");
		expect(links[0].getAttribute("aria-label")).toBe("C:\\Docs\\report.pdf");
		expect(links[0].textContent).toBe("C:\\Docs\\report.pdf");

		expect(links[1].dataset.winPath).toBe("\\\\fileserver\\share\\folder");
		expect(links[1].textContent).toBe("\\\\fileserver\\share\\folder");
	});

	it("wraps quotes and angle brackets in .windows-links-delimiter spans", () => {
		const root = new FakeElement("div");
		const p = root.createEl("p");
		p.appendText('"C:\\Program Files\\App\\app.exe" and <C:\\My Docs\\notes.txt>');

		processReadingViewLinks(root.asHtmlElement(), createContext(null));

		const links = root.querySelectorAll("a");
		expect(links).toHaveLength(2);

		const firstSpans = links[0].querySelectorAll(".windows-links-delimiter");
		expect(firstSpans.map((s) => s.textContent)).toEqual(['"', '"']);
		expect(links[0].textContent).toBe('"C:\\Program Files\\App\\app.exe"');
		expect(links[0].dataset.winPath).toBe("C:\\Program Files\\App\\app.exe");

		const secondSpans = links[1].querySelectorAll(".windows-links-delimiter");
		expect(secondSpans.map((s) => s.textContent)).toEqual(["<", ">"]);
		expect(links[1].textContent).toBe("<C:\\My Docs\\notes.txt>");
		expect(links[1].dataset.winPath).toBe("C:\\My Docs\\notes.txt");
	});

	it("restores CommonMark-collapsed single-backslash UNC only when raw markdown contains \\\\", () => {
		const rootWithUnc = new FakeElement("div");
		rootWithUnc.createEl("p").appendText("Share at \\server\\share\\file.txt");

		processReadingViewLinks(
			rootWithUnc.asHtmlElement(),
			createContext("Share at \\\\server\\share\\file.txt"),
		);

		const restoredLinks = rootWithUnc.querySelectorAll("a");
		expect(restoredLinks).toHaveLength(1);
		expect(restoredLinks[0].dataset.winPath).toBe("\\\\server\\share\\file.txt");
		expect(restoredLinks[0].textContent).toBe("\\\\server\\share\\file.txt");

		const rootWithoutUnc = new FakeElement("div");
		rootWithoutUnc.createEl("p").appendText("Escaped \\notaserver\\notashare");

		processReadingViewLinks(
			rootWithoutUnc.asHtmlElement(),
			createContext("Escaped \\notaserver\\notashare"),
		);

		expect(rootWithoutUnc.querySelectorAll("a")).toHaveLength(0);
	});

	it("skips text inside code, pre, math, and existing anchor elements", () => {
		const root = new FakeElement("div");
		root.createEl("code").appendText("C:\\Temp\\inline.txt");
		root.createEl("pre").appendText("\\\\server\\share\\block.txt");
		const math = root.createEl("span", { cls: "math" });
		math.appendText("\\frac\\numerator");
		const mjx = root.createEl("mjx-container");
		mjx.appendText("\\alpha\\beta");

		processReadingViewLinks(root.asHtmlElement(), createContext(null));

		expect(root.querySelectorAll("a")).toHaveLength(0);
	});

	it("enhances existing Markdown and autolink anchors with Windows or URI-encoded targets", () => {
		const root = new FakeElement("div");
		const p = root.createEl("p");
		p.createEl("a", {
			cls: "external-link",
			href: "C:%5CMy%20Folder%5Creport.pdf",
			text: "My Report",
		});
		p.createEl("a", {
			cls: "external-link",
			href: "\\localhost\\c$\\Windows",
			text: "\\localhost\\c$\\Windows",
		});
		p.createEl("a", {
			cls: "external-link",
			href: "https://obsidian.md",
			text: "Obsidian",
		});

		processReadingViewLinks(
			root.asHtmlElement(),
			createContext("[My Report](C:\\My Folder\\report.pdf) <\\\\localhost\\c$\\Windows>"),
		);

		const anchors = root.querySelectorAll("a");
		expect(anchors[0].classList.contains("windows-links-path")).toBe(true);
		expect(anchors[0].dataset.winPath).toBe("C:\\My Folder\\report.pdf");
		expect(anchors[0].getAttribute("title")).toBe("C:\\My Folder\\report.pdf");
		expect(anchors[0].textContent).toBe("My Report");

		expect(anchors[1].classList.contains("windows-links-path")).toBe(true);
		expect(anchors[1].dataset.winPath).toBe("\\\\localhost\\c$\\Windows");
		expect(anchors[1].textContent).toBe("\\\\localhost\\c$\\Windows");

		expect(anchors[2].classList.contains("windows-links-path")).toBe(false);
	});
});
