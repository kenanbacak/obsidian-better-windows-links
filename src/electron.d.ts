declare module "electron" {
	export interface Shell {
		openPath(path: string): Promise<string>;
		showItemInFolder(fullPath: string): void;
	}

	export const shell: Shell;
}
