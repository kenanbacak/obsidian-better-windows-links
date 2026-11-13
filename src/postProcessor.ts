import { MarkdownPostProcessorContext } from "obsidian";
import { detectWindowsPaths, normalizeWindowsPath } from "./pathDetector";
import { WindowsLinksSettings } from "./settings";

const SKIP_ELEMENT_SELECTOR = "code, pre, a, script, style, .math, mjx-container";

function shouldAllowCollapsedUnc(
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
): boolean {
	const sectionInfo = ctx.getSectionInfo(el);
	if (!sectionInfo) {
		return true;
	}
	const lines = sectionInfo.text.split("\n");
	const sectionText = lines
		.slice(sectionInfo.lineStart, sectionInfo.lineEnd + 1)
		.join("\n");
	return sectionText.includes("\\\\");
}

function safeDecodeUri(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function enhanceExistingAnchors(el: HTMLElement, allowCollapsedUncPrefix: boolean): void {
	const anchors = el.querySelectorAll<HTMLAnchorElement>("a");
	for (const anchor of Array.from(anchors)) {
		if (anchor.classList.contains("windows-links-path")) {
			continue;
		}
		const href = anchor.getAttribute("href");
		if (!href) {
			continue;
		}
		const normalized =
			normalizeWindowsPath(href, { allowCollapsedUncPrefix }) ??
			normalizeWindowsPath(safeDecodeUri(href), { allowCollapsedUncPrefix });
		if (!normalized) {
			continue;
		}
		anchor.classList.add("windows-links-path");
		anchor.dataset.winPath = normalized.normalizedPath;
		if (!anchor.getAttribute("aria-label")) {
			anchor.setAttribute("aria-label", normalized.normalizedPath);
		}
	}
}

/**
 * Post-processes rendered Markdown elements in Reading View to convert plain-text
 * and Markdown-linked Windows/UNC paths into interactive links.
 */
export function processReadingViewLinks(
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	settings: WindowsLinksSettings,
): void {
	const allowCollapsedUncPrefix = shouldAllowCollapsedUnc(el, ctx);
	enhanceExistingAnchors(el, allowCollapsedUncPrefix);

	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	const candidateNodes: Text[] = [];

	let currentNode = walker.nextNode();
	while (currentNode) {
		if (currentNode.nodeType === Node.TEXT_NODE) {
			const textNode = currentNode as Text;
			const parentEl = textNode.parentElement;
			if (parentEl && !parentEl.closest(SKIP_ELEMENT_SELECTOR)) {
				candidateNodes.push(textNode);
			}
		}
		currentNode = walker.nextNode();
	}

	for (const textNode of candidateNodes) {
		const text = textNode.nodeValue;
		if (!text) {
			continue;
		}
		const matches = detectWindowsPaths(text, { allowCollapsedUncPrefix });
		if (matches.length === 0) {
			continue;
		}

		const fragment = document.createDocumentFragment();
		let cursor = 0;

		for (const match of matches) {
			if (match.start > cursor) {
				fragment.appendChild(document.createTextNode(text.slice(cursor, match.start)));
			}

			const link = document.createElement("a");
			link.className = "windows-links-path external-link";
			link.href = "#";
			link.dataset.winPath = match.normalizedPath;
			link.setAttribute("aria-label", match.normalizedPath);
			link.textContent =
				settings.stripQuotesInReadingView && match.isQuoted
					? match.normalizedPath
					: match.displayText;

			fragment.appendChild(link);
			cursor = match.end;
		}

		if (cursor < text.length) {
			fragment.appendChild(document.createTextNode(text.slice(cursor)));
		}

		textNode.replaceWith(fragment);
	}
}
