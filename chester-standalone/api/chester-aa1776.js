// Build placeholder; replaced by bundle during npm run build.
export default function handler(req,res){res.statusCode=503;res.end("NOT_BUILT");}
