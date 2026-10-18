"""Verify public release bytes using normal certificate-verified HTTPS."""
from pathlib import Path
import concurrent.futures, datetime, hashlib, json, urllib.request

root = Path(__file__).resolve().parents[2]
out = Path(__file__).resolve().parent
cache = Path('/tmp/masar-151-live-verified')
site = 'https://41rv.github.io/honor-wall/'
build = root / 'build'
sha = lambda b: hashlib.sha256(b).hexdigest()

def verify(p):
    name = p.relative_to(build).as_posix()
    with urllib.request.urlopen(site + name, timeout=45) as response:
        body = response.read()
        assert response.status == 200
    assert sha(body) == sha(p.read_bytes()), name
    target = cache / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(body)
    return dict(path=name, sha256=sha(body), matches=True)

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    files = list(pool.map(verify, sorted(p for p in build.rglob('*') if p.is_file())))
with urllib.request.urlopen(site, timeout=45) as response:
    assert response.read() == (build / 'index.html').read_bytes()
report = dict(version='1.5.1', url=site, at=datetime.datetime.now(datetime.timezone.utc).isoformat(), tlsVerified=True, allArtifactsMatch=True, rootIndexMatches=True, artifactCount=len(files), files=files)
(out / 'live-artifacts.json').write_text(json.dumps(report, indent=2)+'\n')
print('PASS public HTTPS: all', len(files), 'files and root index match tested production build')
