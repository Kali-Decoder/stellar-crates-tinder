/** Official USDC mark — use for any USDC label in the UI. */
export const USDC_LOGO_SRC = "/assets/tokens/usdc.png";

export function StableTokenLabel({
	token,
	className = "",
	showLogo = true,
}: {
	token: string;
	className?: string;
	showLogo?: boolean;
}) {
	const isUsdc = token.toUpperCase() === "USDC";
	if (!isUsdc || !showLogo) {
		return <span className={className || undefined}>{token}</span>;
	}
	return (
		<span className={`stable-token-label${className ? ` ${className}` : ""}`}>
			<img
				className="stable-token-logo"
				src={USDC_LOGO_SRC}
				alt=""
				width={16}
				height={16}
				decoding="async"
			/>
			<span>USDC</span>
		</span>
	);
}
