from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[2];out=root/'docs/habits-phase8'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((out/'candidate-manifest.json').read_text())
for name,digest in manifest['source'].items():assert sha(root/name)==digest, name
names={str(p.relative_to(root)) for scope in ['app','tests'] for p in (root/scope).rglob('*') if p.is_file()}
names.update(['package.json','package-lock.json','vite.config.ts','playwright.config.ts','tsconfig.json'])
assert names==set(manifest['source']),'Source file inventory changed'
current={str(p.relative_to(root/'build')):sha(p) for p in (root/'build').rglob('*') if p.is_file()}
assert current==manifest['build'],'Final tested artifact changed'
u=json.loads((out/'unit-results.json').read_text());assert u['numPassedTests']==614 and u['numFailedTests']==0 and u['numPendingTests']==0
b=json.loads((out/'browser-results.json').read_text());assert b['stats']['expected']==315 and b['stats']['unexpected']==0 and b['stats']['skipped']==0 and b['stats']['flaky']==0
assert not b['errors']
assert b['config']['webServer']['url']=='http://127.0.0.1:4173/honor-wall/'
assert b['config']['webServer']['command']=='npm run preview -- --port 4173 --strictPort'
p=json.loads((out/'pwa-result.json').read_text());assert p['passed']==20 and not p['errors'] and p['schemaBefore']==60 and p['schemaAfter']==70 and p['testedBuild']==current
assert p['serverUnavailableDuringOfflineRestart'] is True
c=json.loads((out/'capture-results.json').read_text());assert len(c['captures'])==56 and not c['errors'] and c['actualChromiumScreenshots'] and not c['generatedImages']
assert all((out/row['file']).is_file() for row in c['captures'])
live=json.loads((out/'published-artifact.json').read_text());assert live['tlsVerification'] and all(f['status']==200 for f in live['files'])
tech=json.loads((out/'technical-checks.json').read_text());assert all(c['exitCode']==0 for c in tech)
rc=json.loads((out/'rc-artifact.json').read_text());assert sha(out/'habits-rc1.zip')==rc['sha256']
with zipfile.ZipFile(out/'habits-rc1.zip') as archive:
 assert {name:hashlib.sha256(archive.read(name)).hexdigest() for name in archive.namelist()}==current
result={'sourceAndBuildUnchanged':True,'unit':614,'browser':315,'pwaChecks':20,'automatedFailures':0,'skipped':0,'flaky':0,'physicalAndroidVerified':False,'androidBackupDownloadGate':'pending — blocks publication','published':False,'pushed':False}
(out/'final-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
