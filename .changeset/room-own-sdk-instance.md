---
'sanity-plugin-writing-room': patch
---

The room now sets up its own App SDK instance when it can't reach the Studio's, as a first step towards working in an auto-updating Studio. Keep `autoUpdates: false` for now: this hasn't been confirmed on a deployed Studio yet.
