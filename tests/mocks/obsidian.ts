import { FakeElement } from "./domShim";

export interface RecordedNotice {
	message: string;
}

export interface RecordedMenuItem {
	title: string;
	icon: string;
	callback: () => void;
}

export interface RecordedModalSnapshot {
	title: string;
	paragraphs: string[];
	codeTexts: string[];
	buttons: Array<{ text: string; isCta: boolean; trigger: () => void }>;
	close: () => void;
}

export const mockState = {
	notices: [] as RecordedNotice[],
	menuItems: [] as RecordedMenuItem[],
	menuShownCount: 0,
	lastModal: null as RecordedModalSnapshot | null,
	onModalOpened: null as ((modal: RecordedModalSnapshot) => void) | null,
	reset(): void {
		this.notices = [];
		this.menuItems = [];
		this.menuShownCount = 0;
		this.lastModal = null;
		this.onModalOpened = null;
		Platform.isDesktopApp = true;
		Platform.isWin = true;
	},
};

export const Platform = {
	isDesktopApp: true,
	isWin: true,
};

export class Notice {
	constructor(message: string) {
		mockState.notices.push({ message });
	}
}

export class App {}

export class Plugin {
	app: App;
	constructor(app: App = new App()) {
		this.app = app;
	}
}

export class ButtonComponent {
	text = "";
	isCta = false;
	private clickHandler: () => void = () => {};

	setButtonText(text: string): this {
		this.text = text;
		return this;
	}

	setCta(): this {
		this.isCta = true;
		return this;
	}

	onClick(cb: () => void): this {
		this.clickHandler = cb;
		return this;
	}

	triggerClick(): void {
		this.clickHandler();
	}
}

export class ToggleComponent {
	value = false;
	private changeHandler: (value: boolean) => void | Promise<void> = () => {};

	setValue(value: boolean): this {
		this.value = value;
		return this;
	}

	onChange(cb: (value: boolean) => void | Promise<void>): this {
		this.changeHandler = cb;
		return this;
	}

	async triggerChange(value: boolean): Promise<void> {
		this.value = value;
		await this.changeHandler(value);
	}
}

export class Setting {
	static instances: Setting[] = [];

	name = "";
	desc = "";
	readonly buttons: ButtonComponent[] = [];
	readonly toggles: ToggleComponent[] = [];

	constructor(_containerEl: HTMLElement) {
		Setting.instances.push(this);
	}

	setName(name: string): this {
		this.name = name;
		return this;
	}

	setDesc(desc: string): this {
		this.desc = desc;
		return this;
	}

	addButton(cb: (btn: ButtonComponent) => unknown): this {
		const btn = new ButtonComponent();
		cb(btn);
		this.buttons.push(btn);
		return this;
	}

	addToggle(cb: (toggle: ToggleComponent) => unknown): this {
		const toggle = new ToggleComponent();
		cb(toggle);
		this.toggles.push(toggle);
		return this;
	}
}

export class Modal {
	app: App;
	contentEl: HTMLElement;
	private readonly fakeContentEl: FakeElement;
	private titleText = "";

	constructor(app: App) {
		this.app = app;
		this.fakeContentEl = new FakeElement("div");
		this.contentEl = this.fakeContentEl.asHtmlElement();
	}

	setTitle(title: string): this {
		this.titleText = title;
		return this;
	}

	open(): void {
		const startIdx = Setting.instances.length;
		this.onOpen();
		const createdSettings = Setting.instances.slice(startIdx);
		const paragraphs = this.fakeContentEl
			.querySelectorAll("p")
			.map((p) => p.textContent);
		const codeTexts = this.fakeContentEl
			.querySelectorAll("code")
			.map((c) => c.textContent);
		const buttons = createdSettings.flatMap((s) =>
			s.buttons.map((b) => ({
				text: b.text,
				isCta: b.isCta,
				trigger: () => b.triggerClick(),
			})),
		);
		const snapshot: RecordedModalSnapshot = {
			title: this.titleText,
			paragraphs,
			codeTexts,
			buttons,
			close: () => this.close(),
		};
		mockState.lastModal = snapshot;
		if (mockState.onModalOpened) {
			mockState.onModalOpened(snapshot);
		}
	}

	close(): void {
		this.onClose();
	}

	onOpen(): void {}
	onClose(): void {}
}

export class MenuItem {
	private itemTitle = "";
	private itemIcon = "";
	private itemCallback: () => void = () => {};

	setTitle(title: string): this {
		this.itemTitle = title;
		return this;
	}

	setIcon(icon: string): this {
		this.itemIcon = icon;
		return this;
	}

	onClick(cb: () => void): this {
		this.itemCallback = cb;
		return this;
	}

	toRecorded(): RecordedMenuItem {
		return {
			title: this.itemTitle,
			icon: this.itemIcon,
			callback: this.itemCallback,
		};
	}
}

export class Menu {
	addItem(cb: (item: MenuItem) => unknown): this {
		const item = new MenuItem();
		cb(item);
		mockState.menuItems.push(item.toRecorded());
		return this;
	}

	addSeparator(): this {
		return this;
	}

	showAtMouseEvent(_evt: MouseEvent): this {
		mockState.menuShownCount++;
		return this;
	}
}

export abstract class PluginSettingTab {
	app: App;
	containerEl: HTMLElement;

	constructor(app: App, _plugin: Plugin) {
		this.app = app;
		this.containerEl = new FakeElement("div").asHtmlElement();
	}

	display(): void {}
	hide(): void {}
}
