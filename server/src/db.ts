import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URL_SIH || "mongodb://localhost:27017/samadhansetu_test_slice";

export async function connectDB() {
    try {
        if (mongoose.connection.readyState >= 1) return;
        await mongoose.connect(MONGO_URI);
        const dbName = mongoose.connection.db?.databaseName;
        console.log(`[db] Connected to MongoDB — database: ${dbName}`);
    } catch (err) {
        console.error(`[db] MongoDB connection error:`, err);
        process.exit(1);
    }
}

mongoose.connection.on("disconnected", () => {
    console.log("[db] MongoDB disconnected");
});
