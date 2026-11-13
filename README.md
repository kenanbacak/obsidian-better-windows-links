# Windows Links

Automatically detect and open local Windows drive paths (`C:\...`) and UNC network paths (`\\server\share\...`) directly from your Obsidian notes.

## Features

- **Automatic plain-text detection**: Recognizes local Windows paths (`C:\Folder\file.txt`) and UNC network paths (`\\fileserver\shared\report.pdf`) without requiring `file:///` conversion.
- **Spaces and special syntax support**: Handles paths containing spaces wrapped in double quotes (`"C:\Program Files\App\app.exe"` — matching Windows File Explorer's *Copy as path* format), angle brackets (`<C:\My Documents\notes.txt>`), and standard Markdown links (`[Project Folder](C:\Projects\MyApp)`).
- **Live Preview and Reading View**: Works seamlessly in both editing (Live Preview / Source mode) and Reading View, including automatic restoration of UNC `\\` prefixes when CommonMark escapes leading backslashes in rendered Markdown.
- **Direct opening**: Left-clicking a file opens it in its default Windows application; left-clicking a folder or UNC share opens it in File Explorer.
- **Context menu**: Right-click any detected path to **Open in default app**, **Reveal in File Explorer** (opens the parent folder and selects the item), or **Copy path**.
- **Editor commands**: Trigger actions directly from the Command Palette when your cursor is on a path:
  - `Open path under cursor`
  - `Reveal path under cursor in File Explorer`
  - `Copy path under cursor`

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

- **Require Ctrl+click in editor**: When enabled, left-clicking a path in Live Preview places the cursor normally, and holding `Ctrl` (or `Cmd` on macOS) + clicking opens the path.
- **Hide quotes in Reading View**: Strips surrounding double quotes (`"..."`) from quoted paths when rendered in Reading View.
- **Show path icon**: Displays a subtle folder icon before detected Windows and UNC links.

## Installation

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release.
2. Copy them into `<your-vault>/.obsidian/plugins/windows-links/`.
3. Reload Obsidian and enable **Windows Links** under **Settings → Community plugins**.

## Development

```bash
npm install
npm test
npm run build
```

## License

MIT License — see [LICENSE](LICENSE).
