/// <reference types="vite/client" />

declare const __WEB_SHELL_VERSION__: string;
declare const __BRAND_REPO_URL__: string;

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
