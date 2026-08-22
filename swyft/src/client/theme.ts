export type AppTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "swyft:theme";

export function readStoredTheme(): AppTheme {
	if (typeof window === "undefined") return "dark";
	const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
	if (stored === "light" || stored === "dark") return stored;
	return "dark";
}

export function applyTheme(theme: AppTheme) {
	if (typeof document === "undefined") return;
	document.documentElement.dataset.theme = theme;
	const themeColor = document.querySelector<HTMLMetaElement>(
		'meta[name="theme-color"]',
	);
	if (themeColor) {
		themeColor.content = theme === "dark" ? "#070b11" : "#e8eef5";
	}
}

export function applyStoredTheme() {
	applyTheme(readStoredTheme());
}

export function persistTheme(theme: AppTheme) {
	applyTheme(theme);
	if (typeof window !== "undefined") {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
		window.dispatchEvent(new CustomEvent("swyft-theme", { detail: theme }));
	}
}
