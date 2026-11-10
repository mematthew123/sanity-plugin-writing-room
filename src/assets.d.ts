/** Font files: a URL in the template's Vite, a data URL in the built package (see tsdown.config.ts). */
declare module '*.woff2' {
  const url: string
  export default url
}
