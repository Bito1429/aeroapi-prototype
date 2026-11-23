import {neon} from "@neondatabase/serverless";
export function db(){if(!process.env.DATABASE_URL)throw Error("DATABASE_NOT_CONFIGURED");return neon(process.env.DATABASE_URL);}
