# Oma Beats workstation upgrade

Authorized scope: all six areas in the October 2 workstation proposal. Keep old projects readable, preserve private packs, and verify silently.

- [x] Versioned project model: 1–16 bar sequences, names, duplicate/add, eight named tracks, song arrangement, note events and automation.
- [x] Performance: MIDI input/velocity curves, pad sensitivity, note repeat/triplets, overdub/replace, metronome/count-in and quantization strength.
- [x] Sampling: chop during playback, transient snapping, independent tempo stretch, choke groups, resampling.
- [x] Instruments: live note-on/off, piano roll move/resize/velocity, glide, pitch bend, chords and arpeggiator.
- [x] Mixing: per-track gain/pan/mute/solo, EQ/compression/saturation, reverb/delay sends, sidechain ducking, automation and stem export.
- [x] Workspace: persistent transport; Pads, Chop, Piano Roll, Mixer and Song views in existing cream/sage/orange identity.
- [x] Reliability: bounded scheduling, panic/recovery, rotating local backups, migration/validation and integration/audio tests.
- [x] Desktop installers, public release, website update and local installation after checks pass.

Not part of this scope: third-party VST hosting, commercial sample redistribution, copying Akai branding.

Verification caveats: MIDI event handling is exercised programmatically; physical controller testing is pending. CUA currently reports no connected browsers, so final screenshot review is pending.

Released as v0.4.0. Build matrix 37060109993 and publication 37060878243 passed. The public Linux AppImage was checksum-verified and installed without opening or closing the user’s session.
