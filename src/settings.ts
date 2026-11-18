import { App, Plugin, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";

export interface WindowsLinksSettings {
	/** Require holding Ctrl when clicking paths in the editor. */
	requireCtrlClickInEditor: boolean;
	/** Hide surrounding double quotes and angle brackets when displaying paths. */
	stripQuotesInReadingView: boolean;
	/** Display a subtle path icon before detected Windows and UNC links. */
	showFolderIcon: boolean;
	/** Prompt for confirmation before opening executable, script, or shortcut files. */
	confirmExecutablePaths: boolean;
	/** Prompt for confirmation before accessing UNC network paths. */
	confirmUncPaths: boolean;
}

export const DEFAULT_SETTINGS: WindowsLinksSettings = {
	requireCtrlClickInEditor: false,
	stripQuotesInReadingView: false,
	showFolderIcon: false,
	confirmExecutablePaths: true,
	confirmUncPaths: false,
};

type BooleanSettingKey = keyof WindowsLinksSettings;

interface BooleanSettingSpec {
	key: BooleanSettingKey;
	name: string;
	desc: string;
	defaultValue: boolean;
}

const SETTING_SPECS: readonly BooleanSettingSpec[] = [
	{
		key: "requireCtrlClickInEditor",
		name: "Require Ctrl+click in editor",
		desc: "Open paths in live preview only when holding Ctrl, allowing normal clicks to place the cursor.",
		defaultValue: DEFAULT_SETTINGS.requireCtrlClickInEditor,
	},
	{
		key: "stripQuotesInReadingView",
		name: "Hide wrapping quotes and brackets",
		desc: "Hide surrounding double quotes (\"...\") and angle brackets (<...>) when displaying paths.",
		defaultValue: DEFAULT_SETTINGS.stripQuotesInReadingView,
	},
	{
		key: "showFolderIcon",
		name: "Show path icon",
		desc: "Display a subtle icon before detected Windows and UNC paths.",
		defaultValue: DEFAULT_SETTINGS.showFolderIcon,
	},
	{
		key: "confirmExecutablePaths",
		name: "Confirm before opening executable files",
		desc: "Show a confirmation prompt before launching executable, script, or shortcut files (such as .exe, .bat, .ps1, or .lnk).",
		defaultValue: DEFAULT_SETTINGS.confirmExecutablePaths,
	},
	{
		key: "confirmUncPaths",
		name: "Confirm before accessing UNC network paths",
		desc: "Show a confirmation prompt before connecting to UNC network shares (\\\\server\\share).",
		defaultValue: DEFAULT_SETTINGS.confirmUncPaths,
	},
];

export interface WindowsLinksPluginHost extends Plugin {
	settings: WindowsLinksSettings;
	saveSettings: () => Promise<void>;
}

export class WindowsLinksSettingTab extends PluginSettingTab {
	private readonly plugin: WindowsLinksPluginHost;

	constructor(app: App, plugin: WindowsLinksPluginHost) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return SETTING_SPECS.map((spec) => ({
			name: spec.name,
			desc: spec.desc,
			control: {
				type: "toggle",
				key: spec.key,
				defaultValue: spec.defaultValue,
			},
		}));
	}

	getControlValue(key: string): unknown {
		const spec = SETTING_SPECS.find((entry) => entry.key === key);
		if (!spec) {
			return undefined;
		}
		return this.plugin.settings[spec.key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const spec = SETTING_SPECS.find((entry) => entry.key === key);
		if (!spec || typeof value !== "boolean") {
			return;
		}
		this.plugin.settings[spec.key] = value;
		await this.plugin.saveSettings();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		for (const spec of SETTING_SPECS) {
			new Setting(containerEl)
				.setName(spec.name)
				.setDesc(spec.desc)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings[spec.key])
						.onChange(async (value) => {
							this.plugin.settings[spec.key] = value;
							await this.plugin.saveSettings();
						}),
				);
		}
	}
}
