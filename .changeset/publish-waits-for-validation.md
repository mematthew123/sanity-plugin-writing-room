---
'sanity-plugin-writing-room': patch
---

Publish now waits for validation to finish. A publish started in the first moment after opening a document, before validation had run, could go through with a required field still empty.
