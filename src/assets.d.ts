/** A URL in dev, a data URL in the built package (see tsdown.config.ts). */
declare module '*.woff2' {
  const url: string
  export default url
}

/** Class names only; the rules are in `virtual:room-styles` (see css-modules.config.ts). */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}

/** Every CSS Module's rules as one stylesheet, and a hash of it. */
declare module 'virtual:room-styles' {
  export const css: string
  export const key: string
}
