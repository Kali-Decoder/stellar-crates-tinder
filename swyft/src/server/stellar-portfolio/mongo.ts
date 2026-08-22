import mongoose from "mongoose";

let connecting: Promise<typeof mongoose> | null = null;

export function mongoUri(): string | undefined {
	return process.env.MONGODB_URI?.trim() || undefined;
}

export async function connectMongo(uri = mongoUri()): Promise<boolean> {
	if (!uri) return false;
	if (mongoose.connection.readyState === 1) return true;
	if (!connecting) {
		connecting = mongoose.connect(uri, {
			serverSelectionTimeoutMS: 5_000,
		});
	}
	await connecting;
	return true;
}

export function isMongoReady(): boolean {
	return mongoose.connection.readyState === 1;
}
