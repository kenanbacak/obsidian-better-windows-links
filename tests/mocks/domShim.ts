export interface DomAttrOptions {
	cls?: string | string[];
	text?: string;
	href?: string;
	title?: string;
	attr?: Record<string, string | number | boolean | null>;
}

export class FakeClassList {
	private readonly classes = new Set<string>();

	add(...tokens: string[]): void {
		for (const token of tokens) {
			for (const part of token.split(/\s+/)) {
				if (part) {
					this.classes.add(part);
				}
			}
		}
	}

	remove(...tokens: string[]): void {
		for (const token of tokens) {
			this.classes.delete(token);
		}
	}

	contains(token: string): boolean {
		return this.classes.has(token);
	}

	toggle(token: string, force?: boolean): boolean {
		if (force === undefined) {
			if (this.classes.has(token)) {
				this.classes.delete(token);
				return false;
			}
			this.classes.add(token);
			return true;
		}
		if (force) {
			this.classes.add(token);
		} else {
			this.classes.delete(token);
		}
		return force;
	}

	toString(): string {
		return Array.from(this.classes).join(" ");
	}
}

export class FakeNode {
	nodeType: number;
	parentNode: FakeNode | null = null;
	childNodes: FakeNode[] = [];

	constructor(nodeType: number) {
		this.nodeType = nodeType;
	}

	get parentElement(): FakeElement | null {
		return this.parentNode instanceof FakeElement ? this.parentNode : null;
	}

	appendChild<T extends FakeNode>(child: T): T {
		if (child instanceof FakeDocumentFragment) {
			const children = [...child.childNodes];
			child.childNodes = [];
			for (const item of children) {
				this.appendChild(item);
			}
			return child;
		}
		child.parentNode = this;
		this.childNodes.push(child);
		return child;
	}

	appendText(val: string): void {
		this.appendChild(new FakeTextNode(val));
	}

	createEl(tag: string, options?: DomAttrOptions): FakeElement {
		const child = new FakeElement(tag, options);
		return this.appendChild(child);
	}

	createDiv(options?: DomAttrOptions): FakeElement {
		return this.createEl("div", options);
	}

	createSpan(options?: DomAttrOptions): FakeElement {
		return this.createEl("span", options);
	}

	empty(): void {
		for (const child of this.childNodes) {
			child.parentNode = null;
		}
		this.childNodes = [];
	}

	get textContent(): string {
		return this.childNodes.map((child) => child.textContent).join("");
	}

	set textContent(value: string) {
		this.empty();
		if (value.length > 0) {
			this.appendText(value);
		}
	}
}

export class FakeTextNode extends FakeNode {
	nodeValue: string;

	constructor(value: string) {
		super(3);
		this.nodeValue = value;
	}

	override get textContent(): string {
		return this.nodeValue;
	}

	override set textContent(value: string) {
		this.nodeValue = value;
	}

	replaceWith(replacement: FakeNode | string): void {
		const parent = this.parentNode;
		if (!parent) {
			return;
		}
		const index = parent.childNodes.indexOf(this);
		if (index < 0) {
			return;
		}

		const nodesToInsert: FakeNode[] =
			typeof replacement === "string"
				? [new FakeTextNode(replacement)]
				: replacement instanceof FakeDocumentFragment
					? [...replacement.childNodes]
					: [replacement];

		if (replacement instanceof FakeDocumentFragment) {
			replacement.childNodes = [];
		}

		for (const node of nodesToInsert) {
			node.parentNode = parent;
		}
		this.parentNode = null;
		parent.childNodes.splice(index, 1, ...nodesToInsert);
	}
}

export class FakeDocumentFragment extends FakeNode {
	constructor() {
		super(11);
	}
}

export class FakeElement extends FakeNode {
	readonly tagName: string;
	readonly classList = new FakeClassList();
	readonly dataset: Record<string, string | undefined> = {};
	private readonly attributes = new Map<string, string>();
	private readonly listeners = new Map<string, Array<() => void>>();

	constructor(tagName: string, options?: DomAttrOptions) {
		super(1);
		this.tagName = tagName.toLowerCase();
		if (options) {
			this.applyOptions(options);
		}
	}

	private applyOptions(options: DomAttrOptions): void {
		if (options.cls) {
			if (Array.isArray(options.cls)) {
				this.classList.add(...options.cls);
			} else {
				this.classList.add(options.cls);
			}
		}
		if (options.text !== undefined) {
			this.textContent = options.text;
		}
		if (options.href !== undefined) {
			this.setAttribute("href", options.href);
		}
		if (options.title !== undefined) {
			this.setAttribute("title", options.title);
		}
		if (options.attr) {
			for (const [key, val] of Object.entries(options.attr)) {
				if (val !== null) {
					this.setAttribute(key, String(val));
				}
			}
		}
	}

	get className(): string {
		return this.classList.toString();
	}

	set className(value: string) {
		for (const existing of this.classList.toString().split(/\s+/)) {
			if (existing) {
				this.classList.remove(existing);
			}
		}
		this.classList.add(value);
	}

	get href(): string {
		return this.getAttribute("href") ?? "";
	}

	set href(value: string) {
		this.setAttribute("href", value);
	}

	getAttribute(name: string): string | null {
		if (name === "class") {
			return this.className || null;
		}
		if (name.startsWith("data-")) {
			const camel = toCamelCase(name.slice(5));
			return this.dataset[camel] ?? null;
		}
		return this.attributes.get(name) ?? null;
	}

	setAttribute(name: string, value: string): void {
		if (name === "class") {
			this.className = value;
			return;
		}
		if (name.startsWith("data-")) {
			const camel = toCamelCase(name.slice(5));
			this.dataset[camel] = value;
			return;
		}
		this.attributes.set(name, value);
	}

	addEventListener(event: string, listener: () => void): void {
		const list = this.listeners.get(event) ?? [];
		list.push(listener);
		this.listeners.set(event, list);
	}

	click(): void {
		for (const listener of this.listeners.get("click") ?? []) {
			listener();
		}
	}

	matchesSingleSelector(selector: string): boolean {
		const trimmed = selector.trim();
		if (trimmed.startsWith(".")) {
			return this.classList.contains(trimmed.slice(1));
		}
		return this.tagName === trimmed.toLowerCase();
	}

	closest(selectorList: string): FakeElement | null {
		const selectors = selectorList.split(",").map((s) => s.trim());
		let current: FakeNode | null = this;
		while (current instanceof FakeElement) {
			if (selectors.some((sel) => current instanceof FakeElement && current.matchesSingleSelector(sel))) {
				return current;
			}
			current = current.parentNode;
		}
		return null;
	}

	querySelectorAll(selector: string): FakeElement[] {
		const matches: FakeElement[] = [];
		const visit = (node: FakeNode): void => {
			for (const child of node.childNodes) {
				if (child instanceof FakeElement) {
					if (child.matchesSingleSelector(selector)) {
						matches.push(child);
					}
					visit(child);
				}
			}
		};
		visit(this);
		return matches;
	}

	asHtmlElement(): HTMLElement {
		return this as unknown as HTMLElement;
	}
}

function toCamelCase(kebab: string): string {
	return kebab.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

class FakeTreeWalker {
	private readonly nodes: FakeNode[] = [];
	private index = -1;

	constructor(root: FakeNode, whatToShow: number) {
		const collect = (node: FakeNode): void => {
			for (const child of node.childNodes) {
				if (whatToShow === 4 && child.nodeType === 3) {
					this.nodes.push(child);
				}
				collect(child);
			}
		};
		collect(root);
	}

	nextNode(): FakeNode | null {
		this.index++;
		return this.nodes[this.index] ?? null;
	}
}

export function installFakeDomGlobals(): void {
	const g = globalThis as Record<string, unknown>;
	g.Node = { TEXT_NODE: 3 };
	g.NodeFilter = { SHOW_TEXT: 4 };
	g.createFragment = (cb?: (frag: FakeDocumentFragment) => void): FakeDocumentFragment => {
		const frag = new FakeDocumentFragment();
		if (cb) {
			cb(frag);
		}
		return frag;
	};
	g.document = {
		body: new FakeElement("body"),
		createTreeWalker: (root: FakeNode, whatToShow: number): FakeTreeWalker =>
			new FakeTreeWalker(root, whatToShow),
	};
}
