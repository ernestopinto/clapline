# Video Source Component Documentation

The `VideoSourceComponent` is responsible for managing the video player interface, allowing users to select video sources, define subsections (clips), and control playback.

## Overview

- **Selector:** `app-videosource`
- **Standalone:** Yes
- **Template:** `videosource.component.html`
- **Service Dependency:** `ClapVideoSourceService`

---

## Properties

- `tcOutText`: A string representing the current user-entered timecode for the "Out" point of a subsection.
- `videoSrc`: A getter that returns the URL of the currently selected video source.

---

## Lifecycle Hooks

### `ngAfterViewInit()`
Initializes the video element. If a video source is already selected in the service, it loads the video and connects the HTML video element to the `ClapVideoSourceService`.

---

## Methods

### `onSourceChange(event: Event)`
**Purpose:** Handles the change event when a user selects a different video source from the dropdown.
- **Parameters:** `event`: The DOM event from the select element.
- **Actions:** Updates the selected source in the service, pauses and reloads the video element with the new URL, and resets any active subsection selections.

### `onTcOut(text: string)`
**Purpose:** Updates the "Out" timecode for the current subsection.
- **Parameters:** `text`: The raw timecode string entered by the user.
- **Actions:** Stores the text and parses it into seconds, then updates the "SubOut" value in the service.

### `onSubSectionTimeInput(index: number, field: 'tcin' | 'tcout', rawValue: string)`
**Purpose:** Updates the timecode for a specific subsection by its index.
- **Parameters:**
  - `index`: The index of the subsection in the list.
  - `field`: Either `'tcin'` or `'tcout'`.
  - `rawValue`: The new timecode string.
- **Actions:** Calls the service to update the subsection's time values.

### `onSubSectionNameInput(index: number, rawValue: string)`
**Purpose:** Updates the name/label of a specific subsection.
- **Parameters:**
  - `index`: The index of the subsection.
  - `rawValue`: The new name string.
- **Actions:** Calls the service to update the subsection's name.

### `toSecondsValue(tc: string)`
**Purpose:** Utility method to convert a timecode string to a seconds string.
- **Parameters:** `tc`: Timecode string (e.g., "01:30").
- **Returns:** A string representing the total seconds, or an empty string if invalid.

### `editSubsection(sub: VideoSubSectionDTO)`
**Purpose:** Prepares a subsection for editing.
- **Parameters:** `sub`: The subsection object.
- **Actions:** Sets the local `tcOutText` to the subsection's "Out" time and notifies the service to start editing this subsection.

### `playSubsection(sub: VideoSubSectionDTO)`
**Purpose:** Plays a specific subsection.
- **Parameters:** `sub`: The subsection object.
- **Actions:** Sets the local `tcOutText` and instructs the service to play the defined range of the video.

### `playAllSections()`
**Purpose:** Plays all subsections of the current video source in sequence.
- **Actions:** Retrieves the list of subsections and instructs the service to play them one after another.

### `formatTime(t: number | null)`
**Purpose:** Formats a number of seconds into a human-readable string (mm:ss.xx).
- **Parameters:** `t`: Time in seconds.
- **Returns:** Formatted string (e.g., "01:23.45" or "12.00s").

---

## Internal Logic & Effects

- **Auto-Selection:** An effect monitors the available video sources and automatically selects a default one (usually the third in the list or the first) if none is selected.
- **Syncing:** An effect ensures that the local `tcOutText` input is cleared if the service's subsection state is reset elsewhere.
- **Timecode Parsing:** Uses a private helper function `parseTimecodeToSeconds` which supports:
  - Plain seconds (e.g., "12.5")
  - `mm:ss` format
  - `hh:mm:ss` format
