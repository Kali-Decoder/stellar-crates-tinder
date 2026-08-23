import type { Express, Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { runDemoUsdFaucet } from "./faucet.js";
import { createPortfolioHandlers } from "./service.js";

export function createStellarPortfolioRouter(): Router {
	const router = createRouter();
	const h = createPortfolioHandlers();

	const send = async (
		response: Response,
		run: () => Promise<{ status: number; body: unknown }>,
	) => {
		try {
			const result = await run();
			response.status(result.status).json(result.body);
		} catch (err) {
			response.status(500).json({
				error: err instanceof Error ? err.message : "internal error",
			});
		}
	};

	router.post("/faucet", (request, response) =>
		void send(response, () =>
			runDemoUsdFaucet({
				wallet: String(request.body?.wallet ?? ""),
				amountUsd:
					request.body?.amountUsd !== undefined
						? Number(request.body.amountUsd)
						: undefined,
				friendbot: Boolean(request.body?.friendbot),
			}),
		),
	);

	router.post("/baskets", (request, response) =>
		void send(response, () => h.createBasket(request.body)),
	);

	router.get("/baskets", (request, response) => {
		const wallet = String(request.query.wallet ?? "");
		const status = request.query.status
			? String(request.query.status)
			: undefined;
		void send(response, () => h.listBaskets(wallet, status));
	});

	router.get("/baskets/:id", (request: Request, response: Response) =>
		void send(response, () => h.getBasket(String(request.params.id))),
	);

	router.get("/baskets/:id/pnl", (request: Request, response: Response) =>
		void send(response, () => h.getBasketPnl(String(request.params.id))),
	);

	router.get(
		"/wallets/:wallet/portfolio",
		(request: Request, response: Response) =>
			void send(response, () =>
				h.walletPortfolio(String(request.params.wallet)),
			),
	);

	router.post("/baskets/:id/deposits", (request: Request, response: Response) =>
		void send(response, () =>
			h.recordDeposit(String(request.params.id), request.body),
		),
	);

	router.post(
		"/baskets/:id/withdrawals",
		(request: Request, response: Response) =>
			void send(response, () =>
				h.recordWithdraw(String(request.params.id), request.body),
			),
	);

	router.post("/baskets/:id/close", (request: Request, response: Response) =>
		void send(response, () => h.closeBasket(String(request.params.id))),
	);

	router.post(
		"/baskets/:id/rebalances",
		(request: Request, response: Response) =>
			void send(response, () =>
				h.recordRebalance(String(request.params.id), request.body),
			),
	);

	router.get(
		"/wallets/:wallet/activity",
		(request: Request, response: Response) => {
			const kind = request.query.kind
				? String(request.query.kind)
				: undefined;
			const limit = request.query.limit
				? Number(request.query.limit)
				: undefined;
			void send(response, () =>
				h.listActivity(String(request.params.wallet), { kind, limit }),
			);
		},
	);

	router.post("/activity", (request, response) =>
		void send(response, () => h.recordActivity(request.body)),
	);

	router.get("/health", (_request, response) => {
		response.json({
			ok: true,
			service: "stellar-portfolio",
			mongo: Boolean(process.env.MONGODB_URI),
		});
	});

	return router;
}

export function mountStellarPortfolioRoutes(app: Express) {
	app.use("/api/stellar", createStellarPortfolioRouter());
}
