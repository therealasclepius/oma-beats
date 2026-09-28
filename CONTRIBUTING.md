# Development notes

Use Node 24 and `npm ci`. Run `npm run check`, `npm test`, and `npm run smoke` before submitting changes. Keep smoke checks muted and never auto-start playback. Test the interface at a normal desktop size and at a narrow width when changing layout.

Keep sample files, downloaded archives, `.omabeats` projects, credentials, and app data outside the repository. Generate synthetic audio in tests instead of checking in third-party recordings.

The renderer has no Node privileges. Add desktop operations through a narrow preload method with sender validation in the main process. Do not expose generic filesystem, command execution, or arbitrary IPC methods.

Changing the audio scheduler needs regression coverage for independent bank patterns and mono/choke behavior. Changing project serialization must preserve v1/v2 project compatibility.

For a release, update the package version and lockfile, build/test on the target platforms, then publish the resulting artifacts with release notes. Signing, notarization, and auto-updates require a separate setup. The workflow deliberately does not publish releases automatically.
