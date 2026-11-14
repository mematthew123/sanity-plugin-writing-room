---
status: accepted
---

# Existing images are chosen through the Studio's own image sources

The room could only upload an image into the body; a Writer had no way to choose one that already existed, as the Studio's own editor allows. We decided the room offers the image sources the Studio has configured for the body's image type (`form.image.assetSources`, narrowed by the field's `options.sources`) and opens the chosen source's own dialog over the Prose, rather than drawing an image browser of its own.

We chose this for the reason behind ADR-0001: the room promises zero config in any Studio, and only the Studio's sources can reach Media Library and plugin sources, and honour a Studio that has removed or restricted one.

## Considered Options

- **A browser of the room's own**, listing the dataset's images in the room's look. It needs search and paging, which is the document browser DESIGN.md refuses to build; it can never show Media Library or a plugin's source; and it ignores a Studio that has turned the default source off.
- **A room-styled panel around each source.** Every source component brings its own dialog, so this is a dialog inside a panel: the stacked elevation DESIGN.md forbids.
- **One Insert Menu row per source.** The menu would grow with every plugin a Studio installs.
- **An empty image block that offers "Upload" and "Choose".** It leaves an image with no asset in the body whenever the Writer walks away from it.

## Consequences

- The Insert Menu has two image rows, "Upload an image" and "Choose an image", each shown only when it can work (`directUploads: false` removes the first; no sources removes the second). With several sources, the menu's list is replaced in place by their names.
- A source's dialog is Sanity's, like Sanity's inputs in Details: it keeps its own behaviour and the Studio's theme, and matches the room only in a Studio that uses the room's theme. It is not one of the room's own floating things; the Insert Menu closes before it opens.
- The resolved source list is `@beta`, and the Studio's code that turns a selection into a value is private. The room maps a selection itself: an asset reference, a `media` reference as well for a Media Library image, or an upload when a source hands back a file, URL or base64. If the list can't be read, the room offers upload only; the smoke test checks each `sanity` version still exposes it.
- A chosen image brings nothing into the Prose. The description and caption start empty, as after an upload, and as in the Studio.
- Choosing is for inserting. Replacing the image in an existing block is still delete and insert.
- Images in the body only. Files and video stay unknown blocks; the cover image in Details already has the Studio's full input.
