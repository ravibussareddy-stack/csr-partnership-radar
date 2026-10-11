// Loads .env.local then .env for local script runs. In CI the env comes from secrets.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
