# Clap Video Source Service Documentation

The `ClapVideoSourceService` is a central Angular service that manages video state, synchronization between the HTML5 video element and the UI (timeline), and subsection (clip) management.

## Overview

- **Provided In:** `root`
- **Primary Role:** State management for video playback, scrubbing, and subsection editing.
- **Key Technologies:** Angular Signals for reactive state, `requestVideoFrameCallback` / `requestAnimationFrame` for high-frequency synchronization.

---

## Properties (Signals)

The service exposes several signals that represent the current state of the video and its subsections:

- `videoSources`: A list of available `VideoSourceDTO` objects.
- `isLoading`: Boolean indicating if sources are currently being "loaded" (simulated).
- `duration`: The total duration of the currently active video in seconds.
- `currentTime`: The current playback position in seconds.
- `isScrubbing`: Boolean flag set to `true` when the user is interacting with the timeline scrub bar.
- `isPlayingSubSection`: Boolean flag indicating if a specific subsection or a queue of sections is currently playing.
- `subIn`: The start time (in seconds) of the currently selected/editing subsection.
- `subOut`: The end time (in seconds) of the currently selected/editing subsection.
- `selectedSource`: The currently active `VideoSourceDTO`.

---

## Methods

### `connectVideo(video: HTMLVideoElement)`
**Purpose:** Connects a raw HTML video element to the service.
- **Actions:**
    - Cleans up previous listeners and sync loops.
    - Sets up event listeners for `play`, `pause`, `seeking`, `timeupdate`, etc.
    - Initializes duration and current time based on the video element's state.
    - Starts the synchronization loop.

### `beginScrub()` / `endScrub()`
**Purpose:** Manages the scrubbing state.
- **Actions:** `beginScrub` sets `isScrubbing` to `true`, preventing the video's playback from overriding the UI's current time during user interaction. `endScrub` reverts it.

### `setTimeFromTimeline(t: number)`
**Purpose:** Updates the current time from an external source like a timeline component.
- **Parameters:** `t`: The new time in seconds.
- **Actions:** Clamps the value within the video's duration and updates the `currentTime` signal, which in turn triggers a seek in the video element via an effect.

### `setSubSection(tcIn: number | null, tcOut: number | null)`
**Purpose:** Sets both "In" and "Out" points for the current subsection.
- **Actions:** Clamps the values and ensures they are stored in the correct order (min/max) if both are provided.

### `setSubIn(tcIn: number | null)` / `setSubOut(tcOut: number | null)`
**Purpose:** Individually sets the "In" or "Out" points.
- **Actions:** Clamps the value to the video duration.

### `updateSubSectionByIndex(index: number, field: 'name' | 'tcin' | 'tcout', rawValue: string)`
**Purpose:** Updates a specific property of a subsection in the current source's list.
- **Parameters:**
    - `index`: Position in the `subSections` array.
    - `field`: The field to update.
    - `rawValue`: The new string value (timecode or name).
- **Actions:** Updates the `selectedSource` signal and propagates changes back to the main `videoSources` list.

### `editSubSection(sub: VideoSubSectionDTO)`
**Purpose:** Loads a saved subsection into the active `subIn`/`subOut` signals for editing.

### `playSubSection(sub: VideoSubSectionDTO)`
**Purpose:** Plays a specific range of the video defined by the subsection.
- **Actions:** Seeks to the start point, starts playback, and installs a "range stop" to pause at the end point.

### `playAllSections(subs: VideoSubSectionDTO[])`
**Purpose:** Plays multiple subsections in sequence.
- **Actions:** Filters valid subsections and initializes a playback queue.

---

## Internal Logic & Synchronization

### High-Frequency Sync Loop
The service uses a sync loop to ensure the `currentTime` signal is updated as smoothly as possible (ideally matching the screen's refresh rate). It prefers `requestVideoFrameCallback` (available in modern browsers) and falls back to `requestAnimationFrame`.

### Range Stop Logic
When playing a subsection, the service monitors `currentTime` using the same high-frequency loop. When the time reaches the subsection's end point (minus a small epsilon), it:
1. Pauses the video.
2. Snaps the `currentTime` exactly to the end point.
3. Clears the "range stop" monitors.
4. Triggers the next item in the queue if `playAllSections` was used.

### Timecode Parsing
Private helper `_parseTimecodeToSeconds` supports:
- Raw seconds (e.g., `12.5`)
- `mm:ss`
- `hh:mm:ss`
