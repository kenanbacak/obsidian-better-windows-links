import { vi } from "vitest";

export const shell = {
	openPath: vi.fn(async (_targetPath: string): Promise<string> => ""),
	showItemInFolder: vi.fn((_fullPath: string): void => {}),
};
