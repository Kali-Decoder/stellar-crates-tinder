// One-off: simulate create_bucket against testnet and dump EVERY diagnostic event.
import {
	Account,
	Contract,
	Keypair,
	Networks,
	nativeToScVal,
	rpc,
	TransactionBuilder,
	scValToNative,
	xdr,
	Address,
} from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";

const STATE = {};
const cfg = JSON.parse(readFileSync(new URL("./.stellar-deploy.json", import.meta.url), "utf8"));

const mag7 = ["AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "META", "TSLA"];
const allocs = mag7.map((s) => ({
	asset: new Address(cfg.tokens[s]),
	dia_key: `${s}/USD`,
	target_bps: 1400,
}));

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const kp = Keypair.fromSecret("SBEKFISBYLNPMG5TQA3INBOHLBA7EHQBJXLZBDGTYOCAHJPQTUTFXGH2");
const acc = await server.getAccount(kp.publicKey());

const nameScv = nativeToScVal("Magnificent Seven");
const allocsScv = nativeToScVal(
	allocs.map((a) =>
		nativeToScVal([
			a.asset.toScVal(),
			nativeToScVal(a.dia_key),
			nativeToScVal(a.target_bps, { type: "u32" }),
		]),
	),
);

const tx = new TransactionBuilder(acc, { fee: "2000000", networkPassphrase: Networks.TESTNET })
	.addOperation(new Contract(cfg.vault).call("create_bucket", nameScv, allocsScv))
	.setTimeout(60)
	.build();

const sim = await server.simulateTransaction(tx);
console.log("error:", sim.error ?? "(none)");
console.log("result:", sim.results?.map((r) => r.xdr)?.join(",") ?? "(none)");
for (const ev of sim.events ?? []) {
	const e = ev.event();
	console.log("---", ev.inSuccessfulContractCall() ? "[ok-call]" : "[failed]", "contract:", e.contractId()?.toString());
	console.log("   topics:", JSON.stringify(e.topics().map((t) => {
		try { return scValToNative(t); } catch { return t.toXDR("base64"); }
	})));
	console.log("   data:", (() => {
		try { return JSON.stringify(scValToNative(e.data()), (_k, v) => typeof v === "bigint" ? v.toString() : v); }
		catch { return e.data().toXDR("base64"); }
	})());
}
