import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.test.local") });

process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.DEMO_MODE ??= "true";
