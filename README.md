# Oma Beats

A standalone desktop sampler and beat sequencer. Build a drum pattern, chop a sample, and play it across eight banks of pads.

## Features

- 128 pads across banks A–H; four 16-step patterns with tempo, swing, and quantized recording.
- All-bank playback or a single active bank, with independent mono/choke mode per bank.
- Six synthesized starter kits and 12 melodic instruments: bass, leads, keys, and pads. Everything works offline without an account.
- Sample workshop with transient detection, even/random slices, manual markers, zoom, exact cue boundaries, pitch, filter, attack, release, gain, and reverse.
- Local audio import, drag-and-drop, searchable sample packs, and a native **Import pack folder** picker.
- Optional bounded YouTube clip import and a local clip library.
- Undo/redo, autosave, portable `.omabeats` projects including their audio, and stereo WAV export.
- A resizable native window. No browser launcher or Python server is required.

## Run the desktop app

Download a build from [Releases](https://github.com/therealasclepius/oma-beats/releases/tag/v0.3.0), or visit the [Oma Beats website](https://oma-beats.vercel.app/) to try the browser demo. Linux builds are portable AppImages, Windows builds are NSIS installers, and macOS builds are DMGs/ZIPs.

On Omarchy or another Linux x86_64 desktop, the user-local installer verifies the AppImage checksum and adds a launcher entry:

```sh
curl -fsSL https://oma-beats.vercel.app/install.sh | bash
```

[Inspect the installer](install.sh) before running it. No administrator password is needed. Projects and imported samples are preserved.

On Linux, mark the AppImage executable in your file manager, then open it. From a terminal:

```sh
chmod +x Oma-Beats-*.AppImage
./Oma-Beats-*.AppImage
```

The first version is an unsigned development build. Windows/macOS signing and macOS notarization are not configured. The local Linux build has been checked; the GitHub workflow builds each platform on its own runner.

### Build from source

Use Node.js 24 LTS and npm. Git and an internet connection are needed for the initial dependency download.

```sh
git clone https://github.com/therealasclepius/oma-beats.git
cd oma-beats
npm ci
npm start
```

```sh
npm run check    # JavaScript syntax
npm test         # Backend and sequencer regression tests; no audio output
npm run smoke    # Hidden, muted native startup and save-on-close check
npm run pack     # Unpacked app in dist/
npm run dist     # Installer/portable artifacts for the current OS
```

On a headless Linux machine, run the smoke check with `xvfb-run -a npm run smoke`. Packaging for Windows or macOS is handled by the GitHub Actions matrix; build on the target OS for local platform builds. The optional `npm run dev:web` server is for frontend development only and binds to `127.0.0.1:18744`. It uses separate temporary data and does not expose the native folder picker.

## Make a beat

1. Choose a starter kit. Click sequencer steps to make a pattern.
2. Press **Play** or Space. Use `1234 / QWER / ASDF / ZXCV` to play the visible pads.
3. Switch pad banks A–H. Set **Play → All banks** to hear their patterns together.
4. Use **Mono bank** when a new hit should cut off the preceding sound in that bank.
5. Choose **Get samples → Load audio**, or drop an audio file onto a pad. Open **Chop editor**, find or place cues, adjust them, and apply the chops.
6. Use **Save project** for a portable backup; **Export WAV** renders four repetitions of the selected pattern with a tail.

**Undo:** Ctrl+Z / Cmd+Z. **Redo:** Ctrl+Shift+Z / Cmd+Shift+Z. The workshop has its own Undo while cue edits are pending.

## Built-in synths

Choose a pad bank and click **Synths**, or choose an instrument from the kit menu. Start with one of 12 presets, choose a root note, octave and scale, then adjust the oscillator, filter/resonance, ADSR envelope, note length and detune. Preview only plays when you click a preview control.

**Load instrument into bank** assigns 16 generated notes to that bank and preserves its sequencer patterns. Bass presets default to mono; other instruments are polyphonic. The operation supports Undo/Redo. Reopen Synths to edit that bank's patch and apply again.

Notes are rendered to samples with the chosen note length and release. Keyboard presses trigger those complete notes; key-up does not gate the envelope. Generated audio and patch settings are embedded in project files, so projects and WAV exports need no plugin downloads. Loading a new instrument replaces the selected bank's sounds.

## Your sounds and projects

**Browse packs → Import pack folder** copies supported audio files into the app's private library. Unzip downloaded packs first. WAV is recommended; other scanned formats depend on the platform decoder. Files must be under 32 MB, mono/stereo, and up to two minutes. Folder imports support up to 2 GB / 10,000 samples and deduplicate identical files. Original files stay in place. Existing Oma Beats pack folders with `catalog.json` also preserve curated kit assignments and publisher information.

Splice and other commercial/free sample packs are **not included** in the repository or builds. Download sounds through your own accounts, import the files, and follow their original license terms. The six starter kits are synthesized by the app; no third-party drum recordings are bundled.

The native app stores its session and imported library under Electron's per-user app-data directory, outside this repository. Use **File → Open app data folder** to find it. Typical locations:

- Linux: `~/.config/Oma Beats/`
- macOS: `~/Library/Application Support/Oma Beats/`
- Windows: `%APPDATA%\Oma Beats\`

Autosave keeps the current session; **Save project** keeps a named, portable backup. Back up that file before starting a new project.

### Move from the browser prototype

In the original app, click **Save project**. In the desktop app, click **Open** and select that `.omabeats` file. Browser storage is separate and is not automatically copied. To transfer its sound library, import the old `app/packs` folder with **Browse packs → Import pack folder**. The desktop app does not alter the original browser prototype or its saved session.

### Optional YouTube importer

Install [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) and [FFmpeg](https://ffmpeg.org/download.html) and ensure both commands are available on `PATH` when launching the app. yt-dlp may also require a supported JavaScript runtime for YouTube; follow its current installation guide. These executables are not bundled. All offline beatmaking and local sample features work without them.

Paste a public video URL, choose a start time and a 1–120 second duration, and select **Import → chop**. Imports do not play automatically. Clips remain in your local library. Only import audio you have permission to use. Restricted videos or changes to YouTube can prevent an import; local audio import remains available.

## Architecture

- `app/`: framework-free renderer, Web Audio engine, UI, project persistence, and chopping.
- `desktop/main.cjs`: native window, app lifecycle, menu, permissions, save dialogs, and validated IPC.
- `desktop/backend.cjs`: private `oma://app/` protocol handler. The installed app opens no HTTP port.
- `desktop/library.cjs`: local sample indexing, copying, deduplication, and catalog persistence.
- `desktop/importer.cjs`: bounded external downloader/transcoder jobs and local clip cache.
- `test/`: regression tests for bank scheduling, mono isolation, legacy projects, import validation, catalog persistence, and file access boundaries.

The renderer is sandboxed with Node integration disabled and context isolation enabled. Only a narrow preload bridge exposes the pack-folder picker and lifecycle signals. External HTTPS links open in the system browser.

## Current scope

This is a standalone beatmaking app, not a VST3/AU plugin or a full multitrack DAW. Pitch changes also change playback speed; independent time stretching, stem separation, MIDI hardware input, arrangement/song mode, and automatic updates are not implemented. WAV export is an effect-free render and does not include the live output compressor.

## Source and dependency licenses

The source is publicly viewable, but is not currently offered under an open-source license (`UNLICENSED`). Third-party dependencies retain their own licenses. Packaged Electron distributions include Electron/Chromium license notices. Imported samples retain their publishers' licenses and are deliberately excluded from source control and app packaging.

## Public website

`site/` contains the responsive product page. Its playable preview and `/play/` route use the same interface and audio engine as the desktop app: six synthesized drum kits, 36 synths, eight pad banks, patterns, undo, local audio chopping, project files, and WAV export. Audio starts only after interaction. Browser sessions autosave locally and stay separate from the installed app; portable projects work in both. YouTube and pack-folder imports require the desktop app.

```sh
npm run build:site
python -m http.server 18745 --bind 127.0.0.1 --directory dist/site
```

The website build copies `site/`, `install.sh`, and an explicit allowlist of public app renderer files into `dist/site/play/`. A browser host adapter replaces the native bridge and server-dependent library controls. Private sounds, projects, app data, and native desktop code are excluded. Fonts are self-hosted Barlow and Barlow Condensed under their included SIL Open Font Licenses.

The production website is hosted on Vercel with GitHub deployment integration. `vercel.json` builds `dist/site`; `.vercelignore` excludes desktop code, personal data, and local design evidence from CLI uploads. GitHub Pages is also available as a mirror.
