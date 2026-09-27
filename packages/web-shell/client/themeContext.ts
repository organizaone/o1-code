import { createContext, useContext } from 'react';

export const WebShellThemeId = {
  Dark: 'dark',
  Light: 'light',
} as const;

export type WebShellTheme =
  (typeof WebShellThemeId)[keyof typeof WebShellThemeId];

export const WEB_SHELL_THEMES: readonly WebShellTheme[] = [
  WebShellThemeId.Dark,
  WebShellThemeId.Light,
];

const ThemeContext = createContext<WebShellTheme>(WebShellThemeId.Dark);

export const ThemeProvider = ThemeContext.Provider;

export function useTheme(): WebShellTheme {
  return useContext(ThemeContext);
}

export const THEME_SETTING_KEY = 'ui.theme';
export const LANGUAGE_SETTING_KEY = 'general.language';

export function themeSettingToWebShellTheme(
  value: unknown,
  fallback?: WebShellTheme,
): WebShellTheme | undefined {
  if (value === WebShellThemeId.Light || value === 'O1-Code Light')
    return WebShellThemeId.Light;
  if (value === WebShellThemeId.Dark || value === 'O1-Code Dark')
    return WebShellThemeId.Dark;
  return fallback;
}

export function webShellThemeToSettingValue(theme: WebShellTheme): string {
  return theme === WebShellThemeId.Light ? 'O1-Code Light' : 'O1-Code Dark';
}
