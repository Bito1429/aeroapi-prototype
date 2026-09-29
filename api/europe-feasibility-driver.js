export default function handler(req,res){
  res.statusCode=200;
  res.setHeader("content-type","text/html; charset=utf-8");
  res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>AevPath Europe Feasibility Run</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.5}pre{white-space:pre-wrap;background:#f4f4f4;padding:16px;border-radius:8px}strong{font-size:1.15rem}</style></head>
<body>
<h1>AevPath Europe feasibility study</h1>
<p><strong id="state">Starting…</strong></p>
<p>Keep this tab open. It will run the paid historical download in paced, resumable batches and stop automatically when the frozen route + ETA study is complete.</p>
<pre id="log"></pre>
<script>
const state=document.getElementById('state'),log=document.getElementById('log');
async function step(){
  try{
    state.textContent='Running next paced batch…';
    const r=await fetch('/api/europe-feasibility-batch',{cache:'no-store'});
    const j=await r.json();
    log.textContent=JSON.stringify(j,null,2);
    if(!r.ok||!j.ok){state.textContent='Stopped with an error — copy the JSON below.';return}
    if(j.phase==='DONE'||j.continue===false){state.textContent='Complete — copy the JSON below back into ChatGPT.';return}
    state.textContent='Batch complete. Continuing automatically…';
    setTimeout(step,1500);
  }catch(e){
    state.textContent='Connection interrupted. Retrying in 5 seconds…';
    log.textContent=String(e);
    setTimeout(step,5000);
  }
}
step();
</script></body></html>`);
}
