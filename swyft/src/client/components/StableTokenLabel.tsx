/** Official token marks used in balance / spend labels. */
export const USDC_LOGO_SRC = "/assets/tokens/usdc.png";
export const XLM_LOGO_SRC = "/assets/tokens/xlm.png";

const LOGO_BY_TOKEN: Record<string, { src: string; label: string }> = {
	USDC: { src: USDC_LOGO_SRC, label: "USDC" },
	XLM: { src: XLM_LOGO_SRC, label: "XLM" },
};

export function StableTokenLabel({
	token,
	className = "",
	showLogo = true,
}: {
	token: string;
	className?: string;
	showLogo?: boolean;
}) {
	const mark = LOGO_BY_TOKEN[token.toUpperCase()];
	if (!mark || !showLogo) {
		return <span className={className || undefined}>{token}</span>;
	}
	return (
		<span className={`stable-token-label${className ? ` ${className}` : ""}`}>
			<img
				className={`stable-token-logo${mark.label === "XLM" ? " is-xlm" : ""}`}
				src={mark.src}
				alt=""
				width={16}
				height={16}
				decoding="async"
			/>
			<span>{mark.label}</span>
		</span>
	);
}
