import { useCallback, useEffect, useState } from "react";
import {
	connectStellarWallet,
	disconnectStellarWallet,
	initStellarKit,
	restoreStellarWallet,
} from "./kit";

export function useStellarWallet() {
	const [address, setAddress] = useState<string>();
	const [ready, setReady] = useState(false);
	const [status, setStatus] = useState<
		"idle" | "connecting" | "connected" | "error"
	>("idle");
	const [error, setError] = useState("");

	useEffect(() => {
		initStellarKit();
		let cancelled = false;
		void restoreStellarWallet()
			.then((restored) => {
				if (cancelled) return;
				if (restored) {
					setAddress(restored);
					setStatus("connected");
				}
			})
			.finally(() => {
				if (!cancelled) setReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const connect = useCallback(async () => {
		setStatus("connecting");
		setError("");
		try {
			const { address: next } = await connectStellarWallet();
			setAddress(next);
			setStatus("connected");
			return next;
		} catch (caught) {
			const message =
				caught instanceof Error ? caught.message : "Could not connect wallet";
			if (!/closed the modal/i.test(message)) {
				setError(message);
			}
			setStatus(address ? "connected" : "idle");
			throw caught;
		}
	}, [address]);

	const disconnect = useCallback(async () => {
		await disconnectStellarWallet();
		setAddress(undefined);
		setStatus("idle");
		setError("");
	}, []);

	return {
		address,
		ready,
		status,
		error,
		isConnected: Boolean(address),
		isConnecting: status === "connecting",
		connect,
		disconnect,
	};
}
