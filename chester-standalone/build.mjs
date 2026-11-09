import {build} from "esbuild";
import {rmSync,mkdirSync} from "node:fs";
// Bundle and remove source helpers. Only three /api endpoints remain in deployment.
mkdirSync("api",{recursive:true});
await build({
 entryPoints:["source/api/chester-search.js","source/api/chester-details.js","source/api/chester-package.js"],
 bundle:true,minify:true,platform:"node",format:"esm",packages:"external",
 target:"node24",outdir:"api"
});
rmSync("source",{recursive:true,force:true});
