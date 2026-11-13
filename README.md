# Better Windows Links

Automatically detect and open local Windows drive paths (`C:\...`) and UNC network paths (`\\server\share\...`) directly from your Obsidian notes.

## Features

- **Automatic plain-text detection**: Recognizes local Windows paths (`C:\Folder\file.txt`) and UNC network paths (`\\fileserver\shared\report.pdf`) without requiring `file:///` conversion.
- **Spaces and special syntax support**: Handles paths containing spaces wrapped in double quotes (`"C:\Program Files\App\app.exe"` — matching Windows File Explorer's *Copy as path* format), angle brackets (`<C:\My Documents\notes.txt>`), and standard Markdown links (`[Project Folder](C:\Projects\MyApp)`).
- **Live Preview and Reading View**: Works seamlessly in both editing (Live Preview / Source mode) and Reading View, including automatic restoration of UNC `\\` prefixes when CommonMark escapes leading backslashes in rendered Markdown.
- **Direct opening**: Left-clicking a file opens it in its default Windows application; left-clicking a folder or UNC share opens it in File Explorer.
- **Context menu**: Right-click any detected path to **Open in default app**, **Reveal in file explorer** (opens the parent folder and selects the item), or **Copy path**.

## Supported Path Formats

| Format | Example |
| :--- | :--- |
| Plain local path | `C:\Users\Alex\Documents\todo.txt` |
| Plain UNC network path | `\\fileserver\shared\docs\Q1-Report.pdf` |
| UNC path with IP address | `\\192.168.1.50\public\archive` |
| Double-quoted path (with spaces) | `"C:\Program Files (x86)\App\run.exe"` |
| Double-quoted UNC path | `"\\fileserver\Shared Folder\Budget 2026.xlsx"` |
| Angle-bracketed path | `<C:\My Documents\Meeting Notes.md>` |
| Markdown link | `[Shared Docs](\\fileserver\Shared Folder\docs)` |

> **Note**: Inline code (`` `C:\temp\file.txt` ``) and fenced code blocks are intentionally ignored.

## Settings

- **Require Ctrl+click in editor**: When enabled, left-clicking a path in Live Preview places the cursor normally, and holding `Ctrl` + clicking opens the path.
- **Hide wrapping quotes and brackets**: Hides surrounding double quotes (`"..."`) and angle brackets (`<...>`) when displaying paths in Live Preview and Reading View.
- **Show path icon**: Displays a subtle folder icon before detected Windows and UNC links.
- **Confirm before opening executable files**: Enabled by default. Shows a confirmation dialog displaying the full target path before launching executable, script, or shortcut files (`.exe`, `.bat`, `.ps1`, `.lnk`, etc.).
- **Confirm before accessing UNC network paths**: Optional security prompt before connecting to UNC network shares (`\\server\share`).

## Platform Support

This plugin is built and tested exclusively on **Windows** desktop (`explorer.exe` and Windows drive/UNC path conventions). It has **not** been tested on macOS or Linux.

## Installation

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release.
2. Copy them into `<your-vault>/.obsidian/plugins/better-windows-links/`.
3. Reload Obsidian and enable **Better Windows Links** under **Settings → Community plugins**.

## Development

```bash
npm install
npm test
npm run build
```

## License

MIT License — see [LICENSE](LICENSE).
