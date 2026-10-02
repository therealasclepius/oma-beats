# Workstation design brief

Oma Beats is a focused desktop instrument for making a beat from pads, a sample, or a synth. Preserve the cream chassis, sage LCD, orange active controls and existing app typography. It should feel like a musical instrument with a clear recording workflow.

The transport remains visible while editing. A five-part navigation separates Pads, Chop, Piano Roll, Mixer and Song. Sequence names, track names and length controls remain above the active workspace. Performance options are disclosed together, so MIDI and timing setup do not crowd everyday pad playing. The waveform and sixteen performance pads retain the primary composition in Pads. Long step sequences page by bar. The piano roll uses scrollable lanes, a clear bar ruler and orange note blocks. Mixer strips have identical control ordering and explicit effects sends. Song sections show sequence names, lengths and repeats.

Keyboard focus must remain visible. No critical setting depends on a native select popup. Pointer note editing must offer numerical alternatives. Wider views scroll internally instead of overflowing the chassis. Keep existing private sample libraries out of public builds.

Verification: DOM/audio smoke coverage runs in an isolated, muted Electron profile. Screenshot critique is pending a working CUA browser connection; do not represent automated layout checks as a visual review.

## Keyboard sampler refinement

Make the workshop feel playable: a large waveform with a visible edit focus, a persistent audition transport, sixteen cue pads with keyboard legends, and a compact sound strip. Keep the cream/sage/orange palette and existing type. Space auditions the selected processed cue; Shift+Space auditions the source. Arrow keys edit the active parameter, function keys select it, and pads trigger cues directly. Loop audition makes changes audible without repeated clicking. All actions remain available through labeled controls; no shortcut should hijack text entry. No decorative motion; only playback cursor movement, with reduced-motion handling. Preserve non-destructive drafts and explicit application to pads. Browser visual capture remains unavailable at task start.

Sampler v0.5.0 verification: muted local Electron checks and the three-platform build matrix passed (37067034976); published installers through workflow 37067299777. Keyboard controls, live audio, draft/project undo, cancellation, cached peaks and dialog overflow were checked. Screenshot review remains unavailable through CUA.
