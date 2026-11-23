---
'sanity-plugin-writing-room': minor
---

Sorting (experimental, off unless set up): paste a whole piece written elsewhere into an empty document and the room offers to sort it into the title and Details. It moves the Writer's own words into fields and picks among the answers a field already offers; it never writes. The judging is done by TypeSafe's Jev through Vercel AI Gateway, from a route you host with `createSortingHandler` from the new `sanity-plugin-writing-room/sorting` entry, turned on with `writingRoom({sorting: {endpoint}})`. See "Sorting a pasted piece" in the README.

Also: paragraphs pasted into the title of a document with an empty body now go to the body, and an array with items in it (a list of references, say) no longer breaks the Details view, and a reference there shows the document it points to.
