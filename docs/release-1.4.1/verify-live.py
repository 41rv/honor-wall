"""Verify deployed bytes over default TLS; do not bypass certificate checks."""
import concurrent.futures
import hashlib
import json
import pathlib
import subprocess
import datetime
import tempfile

build = pathlib.Path('/tmp/masar-release-141-production')
site = 'https://41rv.github.io/honor-wall/'
output = pathlib.Path(__file__).parent
cache = pathlib.Path(tempfile.mkdtemp(prefix='masar-141-live-'))

def verify(file):
    relative = file.relative_to(build).as_posix()
    destination = cache / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['curl','--fail','--silent','--show-error','--location','--retry','2','--max-time','45',site + relative, '-o', str(destination)],check=True)
    sha = lambda data: hashlib.sha256(data).hexdigest()
    expected = sha(file.read_bytes())
    actual = sha(destination.read_bytes())
    if expected != actual:
        raise RuntimeError('Live artifact mismatch: ' + relative)
    return {'path':relative,'sha256':actual,'matches':True}

files = sorted(p for p in build.rglob('*') if p.is_file())
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    results = list(pool.map(verify, files))
subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','45',site,'-o',str(cache/'root.html')],check=True)
assert (cache/'root.html').read_bytes() == (build/'index.html').read_bytes()
report = {'release':'1.4.1','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':site,'tls_verified':True,'all_artifacts_match':True,'artifact_count':len(results),'root_index_matches':True,'files':results}
(output/'live-artifacts.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('PASS live HTTPS artifacts:',len(results),'and root index; cache',cache)
