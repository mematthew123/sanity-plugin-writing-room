/** A URL in dev, a data URL in the built package (see tsdown.config.ts). */
declare module '*.woff2' {
  const url: string
  export default url
}

/** Its class names. The build puts its rules on the page (see tsdown.config.ts). */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
