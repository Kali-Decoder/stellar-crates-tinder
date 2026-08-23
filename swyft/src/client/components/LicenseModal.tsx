import { useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import {
	acceptLicense,
	hasAcceptedLicense,
	LICENSE_VERSION,
} from "../license-storage";

export function LicenseGate({ children }: { children: ReactNode }) {
	const [accepted, setAccepted] = useState(() => hasAcceptedLicense());
	const [checked, setChecked] = useState(false);

	if (accepted) return <>{children}</>;

	return (
		<>
			<div className="license-gate-shell" aria-hidden="true">
				<div className="license-gate-brand">
					swyft.<span>fun</span>
				</div>
			</div>
			<Dialog.Root open>
				<Dialog.Portal>
					<Dialog.Overlay className="send-dialog-overlay license-dialog-overlay" />
					<Dialog.Content
						className="send-dialog-content license-dialog"
						onOpenAutoFocus={(event) => event.preventDefault()}
						onEscapeKeyDown={(event) => event.preventDefault()}
						onPointerDownOutside={(event) => event.preventDefault()}
						onInteractOutside={(event) => event.preventDefault()}
					>
						<header className="send-dialog-header">
							<div>
								<span className="eyebrow">License agreement</span>
								<Dialog.Title>Before you continue</Dialog.Title>
								<Dialog.Description>
									Please review and accept Swyft’s terms to use the app. This
									is required once per browser.
								</Dialog.Description>
							</div>
						</header>

						<div className="license-dialog-body">
							<p>
								<strong>swyft.fun</strong> is a non-custodial investing
								interface. You keep control of your keys and approve every
								basket. Markets move, baskets can lose value, and past
								performance is not a guarantee of future results.
							</p>
							<ul>
								<li>
									You are solely responsible for wallet security and transaction
									approvals.
								</li>
								<li>
									Swyft does not custody funds and does not provide investment
									advice.
								</li>
								<li>
									On-chain settlement depends on network conditions, fees, and
									available liquidity.
								</li>
								<li>
									By continuing you confirm you are eligible to use the product
									where you live.
								</li>
							</ul>
							<p className="license-dialog-meta">
								License version {LICENSE_VERSION}. Acceptance is stored locally
								on this device.
							</p>
						</div>

						<label className="license-accept-check">
							<input
								type="checkbox"
								checked={checked}
								onChange={(event) => setChecked(event.target.checked)}
							/>
							<span>
								I have read and accept the Swyft license, risk disclosure, and
								terms of use.
							</span>
						</label>

						<div className="send-dialog-actions">
							<button
								type="button"
								className="button button-primary"
								disabled={!checked}
								onClick={() => {
									acceptLicense();
									setAccepted(true);
								}}
							>
								Accept & continue
							</button>
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</>
	);
}
