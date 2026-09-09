> **Public-sharing copy.** Machine-specific paths and host-injected identifiers are redacted where present; see [PUBLIC-SHARING.md](PUBLIC-SHARING.md).

# Installing and launching the museum

The deliverable is a self-contained folder of source, assets, a local server, and launchers. It requires **Node.js 20 or newer**, a desktop browser with **WebGL 2**, a keyboard, and a mouse. All game resources are included. Playing uses no account, paid service, download, or internet connection after Node.js is installed.

Windows 10/11 is the primary launch target. The same local-server command is intended to work on macOS and Linux with Node.js, but consult the verification report for the platforms actually tested. Current desktop Chrome, Edge, or Firefox are suitable browser targets; browser and GPU support must be checked on the receiving machine. Mobile and touch-only play are not supported.

## Windows: recommended launch

1. If needed, install Node.js 20 or newer from [nodejs.org](https://nodejs.org/). Reopen your terminal after installing.
2. Extract `Museum-of-Impossible-Rooms.zip` completely. Open the extracted **Museum of Impossible Rooms** folder. Do not launch files from inside the ZIP viewer.
3. Double-click **Start Museum.cmd**. Keep its console window open while playing.
4. The launcher opens your browser at **http://127.0.0.1:4173/**. If it does not, paste that address into a browser.
5. Follow the title-screen control instructions. The museum needs a click before it can capture the mouse or enable sound. Press Escape to release the mouse.
6. Close the server console, or press Ctrl+C there, when finished.

The folder can live in a path containing spaces. Launchers locate the museum relative to their own location, so they do not require a particular working directory. The `.cmd` launcher does not change PowerShell execution policy or require administrator rights.

## Launch from a terminal

Open a terminal inside the extracted museum folder and run:

```text
node tools/serve.mjs
```

To open the browser yourself:

```text
node tools/serve.mjs --no-open
```

To use another port if 4173 is occupied:

```text
node tools/serve.mjs --port 4174
```

On Windows, `Start Museum.cmd --port 4174` also works. An optional PowerShell launcher accepts `-Port 4174 -NoOpen`; use the `.cmd` launcher if your execution policy does not allow local PowerShell scripts. Do not change your system execution policy merely to play.

For launching from another directory, use absolute, quoted paths:

```text
node "C:\Games\Museum of Impossible Rooms\tools\serve.mjs" --no-open
```

The server also accepts `--root "PATH TO EXTRACTED MUSEUM"` for explicit root selection. It binds only to the local machine; `--host` accepts `127.0.0.1`, `localhost`, or `::1`. It is not an internet hosting service.

## Saves and recovery

Saved progress belongs to the browser profile and exact website address. Use the same browser and **http://127.0.0.1:4173/** to return to a visit. Changing the host spelling, changing ports, using a private window, or clearing browser data may make previous progress unavailable. Browser storage is separate from the extracted folder, so replacing the game files does not itself erase that storage.

Use the game's recovery and reset controls when needed. For exact controls and game recovery behavior, see the in-game help and walkthrough.

## Troubleshooting

- **“Node” is missing:** install Node.js 20+ and reopen the launcher. No `npm install` is required.
- **Port already in use:** another museum server may still be open. Close its console or choose `--port 4174`. A different port has separate browser save storage.
- **Blank canvas or WebGL error:** enable browser hardware acceleration and restart the browser. Try another supported desktop browser. An unavailable WebGL 2 graphics context cannot be replaced by the local server.
- **Page does not load:** keep the server console open and use its printed URL. Do not open `index.html` directly with a `file:` address; browser module loading requires the local server.
- **Mouse does not look around:** click the play surface to capture it. Escape releases it. Browser settings or embedded browser previews may limit pointer capture; use a normal browser tab if necessary.
- **Audio is quiet or absent:** interact with the game first and check its audio setting and the browser tab's mute setting.
- **Missing files after extraction:** extract the entire ZIP again into a new folder and run its launcher. Keep `index.html`, `src`, `vendor`, `assets`, and `tools` together.

## Rebuilding and verification

From the complete source folder:

```text
node --test
node tools/package.mjs
```

The packager creates `release/Museum-of-Impossible-Rooms.zip` and a `.sha256` checksum. It uses only Node.js and includes the source, bundled dependencies and their license files, launchers, authoring documents, and text verification records. Development screenshots remain in the project and are excluded from the default ZIP. `package-manifest.json` inside the ZIP records the size and SHA-256 digest of each included file.

For a clean launch check, extract the ZIP to a new directory, start the extracted launcher or server, and open the printed URL. Compare actual test results and known limitations with the delivered verification report; an archive manifest verifies file contents, not gameplay quality.

On Windows, the included verifier can perform that extraction, manifest check, shipped-launcher start, local-resource check, and precise temporary-server shutdown automatically:

```text
node tools/package.mjs
node tools/verify-package.mjs
```

It creates a new folder under `release`, uses the documented alternate port 4183, and writes `release/clean-install-verification.json`. The optional `--browser-check --playwright-dir "PATH TO PLAYWRIGHT PACKAGE" --browser "PATH TO BROWSER EXECUTABLE"` also runs the real browser checks from the extracted source. `--help` lists paths and options. The final release's audit accompanies its ZIP, identifying that exact archive's digest rather than creating a circular checksum inside it.

An additional developer browser check is included. It requires an **existing, separately supplied Playwright installation** and a Chromium-family browser executable; these are not prerequisites for playing or for the built-in tests. With the local server already running:

```text
node tools/browser-verify.mjs --playwright-dir "PATH TO PLAYWRIGHT PACKAGE" --browser "PATH TO BROWSER EXECUTABLE" --url http://127.0.0.1:4173/ --screenshots
```

`--playwright-dir` points to the installed `playwright` package folder containing its `package.json`. `MUSEUM_PLAYWRIGHT_DIR` and `MUSEUM_BROWSER` may supply the two paths instead. This check does not install software. It runs a fresh, isolated headless visit and writes `evidence/browser-functional.json`; screenshots are optional. Keyboard movement, onboarding, dialogs, hints, save files, and reload use the actual interface. Transformed-state and unavailable-graphics checks explicitly identify their diagnostic setup. The report distinguishes any observed host-injected antivirus requests from game resource requests and keeps those observations visible. See `node tools/browser-verify.mjs --help` for options.
