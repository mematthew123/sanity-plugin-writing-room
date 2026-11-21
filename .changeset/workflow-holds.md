---
'sanity-plugin-writing-room': minor
---

Respect workflow holds. Where a Studio uses Sanity Workflows and a stage holds publishing, the room now refuses **Publish** and **Schedule** on that document, as Structure does, and says why: "A workflow is holding this post. It can be published once the workflow allows it." A hold on deleting keeps an empty document from being discarded. A document that was scheduled before a workflow took hold still goes live, because Sanity publishes it regardless, so the room says so and Unlock stops it. Nothing to configure, and nothing changes in a Studio without workflows.
