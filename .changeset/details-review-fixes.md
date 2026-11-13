---
'sanity-plugin-writing-room': patch
---

Details and publishing are sturdier. Publish waits for a validation of the draft as it is saved, and stops if the slug or date changed while you were deciding. Leaving no longer discards a draft that has only Details filled in, and a slug typed in Details isn't replaced by the next title edit. In Details: tags, numbers, dates and web addresses behave better, a publish problem inside an object goes to the field itself, and Escape in a popover closes the popover rather than Details.
