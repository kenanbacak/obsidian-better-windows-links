import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

export interface WindowsLinksSettings {
	/** Require holding Ctrl (or Cmd on macOS) when clicking paths in the editor. */
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

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Require Ctrl+click in editor")
			.setDesc(
				"Open paths in Live Preview only when holding Ctrl (or Cmd on macOS), allowing normal clicks to place the cursor.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.requireCtrlClickInEditor)
					.onChange(async (value) => {
						this.plugin.settings.requireCtrlClickInEditor = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Hide wrapping quotes and brackets")
			.setDesc(
				"Hide surrounding double quotes (\"...\") and angle brackets (<...>) when displaying paths.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stripQuotesInReadingView)
					.onChange(async (value) => {
						this.plugin.settings.stripQuotesInReadingView = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show path icon")
			.setDesc("Display a subtle icon before detected Windows and UNC paths.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showFolderIcon)
					.onChange(async (value) => {
						this.plugin.settings.showFolderIcon = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Confirm before opening executable files")
			.setDesc(
				"Show a confirmation prompt before launching executable, script, or shortcut files (such as .exe, .bat, .ps1, or .lnk).",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.confirmExecutablePaths)
					.onChange(async (value) => {
						this.plugin.settings.confirmExecutablePaths = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Confirm before accessing UNC network paths")
			.setDesc(
				"Show a confirmation prompt before connecting to UNC network shares (\\\\server\\share).",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.confirmUncPaths)
					.onChange(async (value) => {
						this.plugin.settings.confirmUncPaths = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
