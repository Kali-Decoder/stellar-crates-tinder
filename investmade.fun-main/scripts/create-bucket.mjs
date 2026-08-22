// create_bucket with explicit footprint (share-token code entry) — the CLI/sim path
// misses it, so deploy_v2 traps with "access contract instance outside of the footprint".
import {
	Address,
	Contract,
	Keypair,
	Networks,
	nativeToScVal,
	rpc,
	TransactionBuilder,
	xdr,
} from "@stellar/stellar-sdk";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("./.stellar-deploy.json", import.meta.url), "utf8"));

const name = process.argv[2];
const assets = process.argv[3].split(",");
const bps = process.argv[4]
	? process.argv[4].split(",").map(Number)
	: Array(assets.length).fill(Math.floor(10000 / assets.length));

const allocs = nativeToScVal(
	assets.map((s, i) =>
		nativeToScVal([
			new Address(cfg.tokens[s]).toScVal(),
			nativeToScVal(`${s}/USD`),
			nativeToScVal(bps[i], { type: "u32" }),
		]),
	),
);

const key = (c) => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
	contract: new Address(c).toScVal().address(),
	key: xdr.ScVal.scvLedgerKeyContractInstance(),
	durability: xdr.ContractDataDurability.persistent(),
}));
const code = (hashHex) => xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(hashHex, "hex") }));

const vaultCodeHash = createHash("sha256")
	.update(readFileSync(new URL("../contracts/target/wasm32v1-none/release/bucket_vault.wasm", import.meta.url)))
	.digest("hex");

const fp = new xdr.LedgerFootprint({
	readOnly: [code(cfg.shareWasmHash), code(vaultCodeHash)],
	readWrite: [key(cfg.vault)],
});
const resources = new xdr.SorobanResources({
	footprint: fp,
	instructions: 40_000_000,
	diskReadBytes: 400_000,
	writeBytes: 200_000,
});
const data = new xdr.SorobanTransactionData({
	resources,
	resourceFee: xdr.Int64.fromString("5000000"),
	ext: new xdr.SorobanTransactionDataExt(0),
});

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const kp = Keypair.fromSecret(execFileSync("stellar", ["keys", "secret", "demo-admin"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim());
const acc = await server.getAccount(kp.publicKey());

const tx = new TransactionBuilder(acc, { fee: "6000000", networkPassphrase: Networks.TESTNET })
	.addOperation(new Contract(cfg.vault).call("create_bucket", nativeToScVal(name), allocs))
	.setSorobanData(data)
	.setTimeout(60)
	.build();
tx.sign(kp);

const sent = await server.sendTransaction(tx);
console.log("status:", sent.status, sent.hash);
if (sent.status === "ERROR") {
	console.log("errorResult:", JSON.stringify(sent.errorResult, (_k, v) => typeof v === "bigint" ? v.toString() : v, 1).slice(0, 800));
}
let r = sent;
for (let i = 0; i < 30 && r.status === "NOT_FOUND" || r.status === "PENDING"; i++) {
	await new Promise((res) => setTimeout(res, 1500));
	r = await server.getTransaction(r.hash);
}
console.log("final:", r.status);
