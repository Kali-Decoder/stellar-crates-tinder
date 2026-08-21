import { Moon, Sun } from "lucide-react";
import { useTheme } from "../useTheme";

export function ThemeToggle({ className = "" }: { className?: string }) {
	const { theme, toggleTheme } = useTheme();
	const isDark = theme === "dark";

	return (
		<button
			type="button"
			className={`theme-toggle${className ? ` ${className}` : ""}`}
			onClick={toggleTheme}
			aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
			title={isDark ? "Light mode" : "Dark mode"}
		>
			{isDark ? <Sun size={18} strokeWidth={1.9} /> : <Moon size={18} strokeWidth={1.9} />}
		</button>
	);
}
