import type { AnalyzeSignal } from "../analyze-signal";

/** Compact analyze panel: score gauge, factor bars, sparkline, comments. */
export function AnalyzePanel({
	analyze,
	periodLabel,
	symbol,
}: {
	analyze: AnalyzeSignal;
	periodLabel: string;
	symbol: string;
}) {
	const kind = analyze.label.toLowerCase();
	const sparkPoints = sparkPolyline(analyze.spark);
	const ret = analyze.periodReturnPct;

	return (
		<section
			className={`card-analyze kind-${kind}`}
			aria-label={`${symbol} analyze: ${analyze.label} ${analyze.score} percent`}
		>
			<header className="card-analyze-head">
				<div>
					<span className="card-analyze-eyebrow">Analyze</span>
					<strong className="card-analyze-title">{analyze.detail}</strong>
				</div>
				<div className={`card-analyze-score kind-${kind}`} aria-hidden="true">
					<svg viewBox="0 0 36 36" className="card-analyze-ring">
						<title>
							{analyze.label} {analyze.score}%
						</title>
						<path
							className="card-analyze-ring-track"
							d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 1 1 0-31"
						/>
						<path
							className="card-analyze-ring-value"
							strokeDasharray={`${analyze.score}, 100`}
							d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 1 1 0-31"
						/>
					</svg>
					<span>
						<b>{analyze.score}</b>
						<small>%</small>
					</span>
				</div>
			</header>

			<div className="card-analyze-badge-row">
				<span className={`card-analyze-badge kind-${kind}`}>
					{analyze.label}
				</span>
				<span className="card-analyze-period">
					{ret >= 0 ? "+" : ""}
					{ret.toFixed(1)}% · {periodLabel}
				</span>
			</div>

			<div className="card-analyze-visual">
				<div className="card-analyze-spark" aria-hidden="true">
					<svg viewBox="0 0 100 36" preserveAspectRatio="none">
						<title>{symbol} path</title>
						<polyline
							className="card-analyze-spark-line"
							fill="none"
							points={sparkPoints}
						/>
						<polygon
							className="card-analyze-spark-fill"
							points={`0,36 ${sparkPoints} 100,36`}
						/>
					</svg>
					<span>Path</span>
				</div>

				<ul className="card-analyze-factors" aria-label="Signal factors">
					{(
						[
							["Momentum", analyze.factors.momentum],
							["Trend", analyze.factors.trend],
							["Stability", analyze.factors.stability],
						] as const
					).map(([name, value]) => (
						<li key={name}>
							<span>{name}</span>
							<div
								className="card-analyze-factor-bar"
								role="meter"
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={value}
								aria-label={`${name} ${value}`}
							>
								<em style={{ width: `${value}%` }} />
							</div>
							<strong>{value}</strong>
						</li>
					))}
				</ul>
			</div>

			<ul className="card-analyze-comments">
				{analyze.comments.map((comment) => (
					<li key={comment}>{comment}</li>
				))}
			</ul>

			<p className="card-analyze-disclaimer">
				DIA chart momentum for this timeframe — not investment advice.
			</p>
		</section>
	);
}

function sparkPolyline(spark: number[]): string {
	if (!spark.length) return "0,18 100,18";
	const n = spark.length;
	return spark
		.map((y, i) => {
			const x = n === 1 ? 0 : (i / (n - 1)) * 100;
			const py = 32 - y * 28;
			return `${x.toFixed(2)},${py.toFixed(2)}`;
		})
		.join(" ");
}
