import {neon} from "@neondatabase/serverless";
export function db(){const url=process.env.DATABASE_URL;if(!url)throw Error("DATABASE_URL not configured");return neon(url);}