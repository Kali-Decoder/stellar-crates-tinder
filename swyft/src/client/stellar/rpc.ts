import {
	Address,
	Contract,
	Networks,
	TransactionBuilder,
	nativeToScVal,
	rpc,
	scValToNative,
	xdr,
} from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import {
	STELLAR_NETWORK_PASSPHRASE,
	STELLAR_RPC_URL,
} from "./config";
import { initStellarKit } from "./kit";

let server: rpc.Server | undefined;

export function getRpcServer() {
	if (!server) {
		server = new rpc.Server(STELLAR_RPC_URL, { allowHttp: false });
	}
	return server;
}

export type InvokeResult<T = unknown> = {
	hash: string;
	returnValue: T;
};

/**
 * Simulate → assemble → wallet-sign → submit → wait for SUCCESS.
 */
export async function invokeContract<T = unknown>(params: {
	contractId: string;
	method: string;
	args: xdr.ScVal[];
	source: string;
	fee?: string;
}): Promise<InvokeResult<T>> {
	initStellarKit();
	const rpcServer = getRpcServer();
	const account = await rpcServer.getAccount(params.source);
	const contract = new Contract(params.contractId);
	const passphrase = STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;

	const built = new TransactionBuilder(account, {
		fee: params.fee ?? "2000000",
		networkPassphrase: passphrase,
	})
		.addOperation(contract.call(params.method, ...params.args))
		.setTimeout(180)
		.build();

	const simulated = await rpcServer.simulateTransaction(built);
	if (rpc.Api.isSimulationError(simulated)) {
		throw new Error(
			`Simulation failed (${params.method}): ${simulated.error}`,
		);
	}

	const prepared = rpc.assembleTransaction(built, simulated).build();
	const { signedTxXdr } = await StellarWalletsKit.signTransaction(
		prepared.toXDR(),
		{
			networkPassphrase: passphrase,
			address: params.source,
		},
	);

	const signed = TransactionBuilder.fromXDR(signedTxXdr, passphrase);
	const sent = await rpcServer.sendTransaction(signed);
	if (sent.status === "ERROR" || !sent.hash) {
		throw new Error(
			`Submit failed (${params.method}): ${JSON.stringify(sent.errorResult ?? sent)}`,
		);
	}

	const final = await waitForTx(sent.hash);
	if (final.status !== "SUCCESS") {
		const detail = formatTxFailure(final);
		throw new Error(
			detail
				? `Transaction ${sent.hash} ended as ${final.status}: ${detail}`
				: `Transaction ${sent.hash} ended as ${final.status}`,
		);
	}

	const returnValue = final.returnValue
		? (scValToNative(final.returnValue) as T)
		: (undefined as T);

	return { hash: sent.hash, returnValue };
}

async function waitForTx(hash: string, timeoutMs = 90_000) {
	const rpcServer = getRpcServer();
	const deadline = Date.now() + timeoutMs;
	let latest = await rpcServer.getTransaction(hash);
	while (latest.status === "NOT_FOUND" && Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 1500));
		latest = await rpcServer.getTransaction(hash);
	}
	return latest;
}

function formatTxFailure(tx: Awaited<ReturnType<typeof waitForTx>>): string {
	const events =
		"diagnosticEventsXdr" in tx && Array.isArray(tx.diagnosticEventsXdr)
			? tx.diagnosticEventsXdr
			: [];
	for (const raw of events) {
		try {
			const diagnostic = xdr.DiagnosticEvent.fromXDR(raw, "base64");
			if (diagnostic.inSuccessfulContractCall()) continue;
			const topics = diagnostic.event().body().value().topics();
			const labels = topics.map((topic) => {
				const kind = topic.switch().name;
				if (kind === "scvSymbol") return topic.sym().toString();
				if (kind === "scvString") return topic.str().toString();
				if (kind === "scvError") {
					const err = topic.error();
					return `${err.switch().name}:${err.switch().value}`;
				}
				return kind;
			});
			if (labels.includes("error") || labels.includes("host_fn_failed")) {
				return labels.join(" ");
			}
		} catch {
			/* ignore malformed diagnostics */
		}
	}
	return "";
}

export function addressScVal(id: string) {
	return new Address(id).toScVal();
}

export function i128ScVal(amount: bigint) {
	return nativeToScVal(amount, { type: "i128" });
}

export function u32ScVal(n: number) {
	return nativeToScVal(n, { type: "u32" });
}

export function stringScVal(s: string) {
	return nativeToScVal(s);
}

/** Allocation struct as Soroban map (matches #[contracttype] Allocation). */
export function allocationScVal(input: {
	asset: string;
	diaKey: string;
	targetBps: number;
}) {
	return xdr.ScVal.scvMap([
		new xdr.ScMapEntry({
			key: xdr.ScVal.scvSymbol("asset"),
			val: addressScVal(input.asset),
		}),
		new xdr.ScMapEntry({
			key: xdr.ScVal.scvSymbol("dia_key"),
			val: stringScVal(input.diaKey),
		}),
		new xdr.ScMapEntry({
			key: xdr.ScVal.scvSymbol("target_bps"),
			val: u32ScVal(input.targetBps),
		}),
	]);
}
