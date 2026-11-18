import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import {
	DEFAULT_SETTINGS,
	WindowsLinksPluginHost,
	WindowsLinksSettings,
	WindowsLinksSettingTab,
} from "../src/settings";
import { installFakeDomGlobals } from "./mocks/domShim";
import { Setting } from "./mocks/obsidian";

function createHost(
	initial: Partial<WindowsLinksSettings> = {},
): { host: WindowsLinksPluginHost; saveSettings: ReturnType<typeof vi.fn> } {
	const saveSettings = vi.fn(async () => {});
	const host = {
		app: new App(),
		settings: { ...DEFAULT_SETTINGS, ...initial },
		saveSettings,
	} as unknown as WindowsLinksPluginHost;
	return { host, saveSettings };
}

describe("WindowsLinksSettingTab", () => {
	beforeEach(() => {
		installFakeDomGlobals();
		Setting.instances = [];
	});

	it("returns all 5 declarative setting definitions for Obsidian settings search", () => {
		const { host } = createHost();
		const tab = new WindowsLinksSettingTab(host.app, host);
		const definitions = tab.getSettingDefinitions();

		expect(definitions).toHaveLength(5);
		expect(definitions.map((d) => ("control" in d && d.control ? d.control.key : ""))).toEqual([
			"requireCtrlClickInEditor",
			"stripQuotesInReadingView",
			"showFolderIcon",
			"confirmExecutablePaths",
			"confirmUncPaths",
		]);
		expect(definitions.every((d) => "control" in d && d.control?.type === "toggle")).toBe(true);
	});

	it("reads and updates control values via getControlValue and setControlValue", async () => {
		const { host, saveSettings } = createHost();
		const tab = new WindowsLinksSettingTab(host.app, host);

		expect(tab.getControlValue("confirmExecutablePaths")).toBe(true);
		expect(tab.getControlValue("confirmUncPaths")).toBe(false);
		expect(tab.getControlValue("unknownKey")).toBeUndefined();

		await tab.setControlValue("confirmUncPaths", true);
		expect(host.settings.confirmUncPaths).toBe(true);
		expect(saveSettings).toHaveBeenCalledTimes(1);

		await tab.setControlValue("confirmUncPaths", "not-a-boolean");
		await tab.setControlValue("unknownKey", true);
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});

	it("renders imperative fallback settings in display() and persists toggle changes", async () => {
		const { host, saveSettings } = createHost();
		const tab = new WindowsLinksSettingTab(host.app, host);

		tab.display();

		expect(Setting.instances).toHaveLength(5);
		expect(Setting.instances.map((s) => s.name)).toEqual([
			"Require Ctrl+click in editor",
			"Hide wrapping quotes and brackets",
			"Show path icon",
			"Confirm before opening executable files",
			"Confirm before accessing UNC network paths",
		]);

		await Setting.instances[0].toggles[0].triggerChange(true);
		expect(host.settings.requireCtrlClickInEditor).toBe(true);
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});
});
