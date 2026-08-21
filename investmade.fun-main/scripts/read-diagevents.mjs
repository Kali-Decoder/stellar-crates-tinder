import { rpc, xdr } from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const r = await server.getTransaction(process.argv[2]);

const P = (t) => {
	const s = t.switch().name;
	try {
		switch (s) {
			case "scvBool": return String(t.b());
			case "scvVoid": return "void";
			case "scvError": return "error:" + t.error().switch().name;
			case "scvU32": return String(t.u32());
			case "scvI32": return String(t.i32());
			case "scvU64": return t.u64().toString();
			case "scvI64": return t.i64().toString();
			case "scvU128": {
				const parts = t.u128();
				return (BigInt(parts.hi().toString()) << 64n | BigInt(parts.lo().toString())).toString();
			}
			case "scvSymbol": return t.sym().toString();
			case "scvString": return JSON.stringify(Buffer.from(t.str()?.toString?.() ?? "").toString());
			case "scvBytes": return "bytes:" + Buffer.from(t.bytes()).toString("hex").slice(0, 40);
			case "scvAddress": return "addr";
			case "scvVec": return "[" + t.vec().map(P).join(", ") + "]";
			case "scvMap": return "{" + t.map().map((kv) => P(kv.key()) + ": " + P(kv.val())).join(", ") + "}";
			default: return s;
		}
	} catch {
		return s + "?" + t.toXDR("hex").slice(0, 60);
	}
};

console.log("status:", r.status);
for (const b64 of r.diagnosticEventsXdr ?? []) {
	let de;
	try {
		de = { event: xdr.DiagnosticEvent.fromXDR(b64, "base64").event(), ok: xdr.DiagnosticEvent.fromXDR(b64, "base64").inSuccessfulContractCall() };
	} catch {
		const ce = xdr.ContractEvent.fromXDR(b64, "base64");
		de = { event: ce, ok: true };
	}
	const e = de.event;
	console.log(
		de.ok ? "[ok]  " : "[FAIL]",
		e.contractId()?.toString?.() || "(sys)",
		"|",
		e.topics().map(P).join("/"),
		"=",
		P(e.data()),
	);
}
