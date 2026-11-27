---
'sanity-plugin-writing-room': minor
---

The room's styles are now plain CSS that the plugin carries inside its own JavaScript, and `styled-components` is no longer a peer dependency. Nothing changes in how the room looks or how it's installed: there is still no stylesheet to import. Sanity is moving the Studio off styled-components, and the room no longer depends on it being there. The styles reach the page when the room is opened, not when the plugin is imported, and carry the page's Content Security Policy nonce where it states one (`<meta property="csp-nonce">` or `__webpack_nonce__`).
