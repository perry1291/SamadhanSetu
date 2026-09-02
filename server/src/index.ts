import app from "./app";
import { connectDB } from "./db";

const PORT = parseInt(process.env.PORT || "4000", 10);

async function main() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`[server] Admin Portal Slice running on http://localhost:${PORT}`);
        console.log(`[server] Health: http://localhost:${PORT}/health`);
    });
}

main().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
});
