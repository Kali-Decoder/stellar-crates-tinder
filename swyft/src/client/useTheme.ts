import { useEffect, useState } from "react";
import {
	type AppTheme,
	applyStoredTheme,
	persistTheme,
	readStoredTheme,
} from "./theme";

export function useTheme() {
	const [theme, setTheme] = useState<AppTheme>(() => readStoredTheme());

	useEffect(() => {
		applyStoredTheme();
		function sync(event: Event) {
			const next = (event as CustomEvent<AppTheme>).detail;
			setTheme(next === "light" || next === "dark" ? next : readStoredTheme());
		}
		window.addEventListener("swyft-theme", sync);
		return () => window.removeEventListener("swyft-theme", sync);
	}, []);

	function toggleTheme() {
		persistTheme(theme === "dark" ? "light" : "dark");
	}

	return {
		theme,
		toggleTheme,
		setTheme: (next: AppTheme) => persistTheme(next),
	};
}
