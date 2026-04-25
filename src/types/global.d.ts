// Type declarations for browser extension

declare module 'webextension-polyfill' {
  const chrome: typeof globalThis.chrome;
  export { chrome };
  export default chrome;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}