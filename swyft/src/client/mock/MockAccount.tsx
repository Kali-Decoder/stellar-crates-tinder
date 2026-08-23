import type { OnboardingPreferences } from "../../domain/schemas";
import { StableTokenLabel } from "../components/StableTokenLabel";
import { shortStellarAddress } from "../stellar/kit";

export function MockAccount({
	wallet,
	preferences,
	onResetPlan,
	onDisconnect,
}: {
	wallet: string;
	preferences: OnboardingPreferences;
	onResetPlan: () => void;
	onDisconnect: () => void;
}) {
	return (
		<main className="account-page">
			<header className="account-heading">
				<span className="eyebrow">Account</span>
				<h1>Your Swyft plan</h1>
				<p>Non-custodial on Stellar. Rules stay on this device.</p>
			</header>

			<section className="account-balance" aria-labelledby="stellar-wallet-title">
				<div>
					<span className="account-label" id="stellar-wallet-title">
						Stellar wallet
					</span>
					<strong>{shortStellarAddress(wallet)}</strong>
					<p>
						<StableTokenLabel token="USDC" /> on Stellar · you approve every
						basket.
					</p>
				</div>
			</section>

			<section className="account-card" aria-labelledby="rules-title">
				<h2 id="rules-title">Investing rules</h2>
				<dl className="account-rules">
					<div>
						<dt>Network</dt>
						<dd>Stellar</dd>
					</div>
					<div>
						<dt>Cadence</dt>
						<dd>{preferences.cadence}</dd>
					</div>
					<div>
						<dt>Period limit</dt>
						<dd>${preferences.periodLimitUsd}</dd>
					</div>
					<div>
						<dt>Ticket size</dt>
						<dd>
							${preferences.ticketSizeUsd} <StableTokenLabel token="USDC" />
						</dd>
					</div>
					<div>
						<dt>Risk</dt>
						<dd>{preferences.riskMode}</dd>
					</div>
					<div>
						<dt>Assets</dt>
						<dd>{preferences.assetClasses.join(" + ")}</dd>
					</div>
				</dl>
				<button type="button" className="button button-outline" onClick={onResetPlan}>
					Reset plan
				</button>
			</section>

			<section className="account-card">
				<h2>Session</h2>
				<p>Log out disconnects Freighter / your Stellar wallet from Swyft.</p>
				<button type="button" className="button button-primary" onClick={onDisconnect}>
					Log out
				</button>
			</section>
		</main>
	);
}
