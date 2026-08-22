import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { config as loadEnvironment } from "dotenv";
import { connectMongo, mongoUri } from "./mongo.js";
import { mountStellarPortfolioRoutes } from "./routes.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(root, "..");
loadEnvironment({ path: path.join(serverRoot, ".env.local") });
loadEnvironment({ path: path.join(serverRoot, ".env") });
// Fall back to swyft/.env when developing the monorepo side-by-side.
loadEnvironment({ path: path.resolve(serverRoot, "../swyft/.env.local") });
loadEnvironment({ path: path.resolve(serverRoot, "../swyft/.env") });

const port = Number(process.env.STELLAR_PORTFOLIO_PORT ?? process.env.PORT ?? 8787);
const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:5173";

async function main() {
	const app = express();
	app.use((request, response, next) => {
		response.setHeader("Access-Control-Allow-Origin", origin);
		response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
		response.setHeader("Access-Control-Allow-Headers", "Content-Type");
		if (request.method === "OPTIONS") {
			response.status(204).end();
			return;
		}
		next();
	});
	app.use(express.json({ limit: "128kb" }));

	const uri = mongoUri();
	if (uri) {
		await connectMongo(uri);
		console.log(
			JSON.stringify({
				event: "mongo_connected",
				uri: uri.replace(/\/\/.*@/, "//***@"),
			}),
		);
	} else {
		console.log(
			JSON.stringify({
				event: "mongo_skipped",
				message: "MONGODB_URI unset — using in-memory basket store",
			}),
		);
	}

	mountStellarPortfolioRoutes(app);

	app.listen(port, () => {
		console.log(
			JSON.stringify({
				event: "stellar_portfolio_started",
				port,
				mongo: Boolean(uri),
			}),
		);
	});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
