from pathlib import Path
import json,hashlib,subprocess,zipfile
root=Path(__file__).resolve().parents[2];out=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((out/'candidate-manifest.json').read_text())
assert all(sha(root/n)==h for n,h in m['source'].items()),'Source changed after freeze'
build={str(p.relative_to(root/'build')):sha(p) for p in (root/'build').rglob('*') if p.is_file()}
assert build==m['build'],'Build changed during final verification'
with zipfile.ZipFile(out/'candidate.zip') as z:assert {n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}==build
u=json.loads((out/'unit-final.json').read_text());assert u['numPassedTests']==700 and u['numFailedTests']==0 and u['numPendingTests']==0
assert json.loads((out/'browser-exit.json').read_text())['exitCode']==0
b=json.loads((out/'browser-final.json').read_text());assert b['stats']['expected']==333 and b['stats']['unexpected']==0 and b['stats']['skipped']==0 and b['stats']['flaky']==0 and not b['errors']
assert b['config']['webServer']['url']=='http://127.0.0.1:4173/honor-wall/'
p=json.loads((out/'native-pwa.json').read_text());assert p['passed']==12 and not p['errors'] and p['testedBuild']==build and p['schemaBefore']==70 and p['schemaAfter']==80 and p['serverUnavailableDuringOfflineRestart']
before=json.loads((out/'native-before.json').read_text());after=json.loads((out/'native-after.json').read_text());assert len(before['rows'])==19 and len(after['rows'])==20 and after['rows']['habitAssessments']==[];assert all(before['rows'][n]==after['rows'][n] and before['schema']['indexes'][n]==after['schema']['indexes'][n] for n in before['rows']);assert before['schema']['version']==70 and after['schema']['version']==80
perf=json.loads((out/'performance.json').read_text());assert perf['testedBuild']==build and all(r['idleAdditionalGetAllReads']==0 for r in perf['reports'])
for stage in ['before','after']:
 c=json.loads((out/stage/'capture-results.json').read_text());assert len(c['captures'])==36 and not c['errors'] and c['actualChromiumScreenshots'] and not c['generatedImages']
 if stage=='after':assert c['testedBuild']==build
 assert all((out/stage/r['file']).is_file() for r in c['captures'])
recorded=json.loads((out/'recording-captures.json').read_text());assert len(recorded['captures'])==8 and not recorded['errors'] and recorded['actualBrowserScreenshots'] and not recorded['generatedImages']
renderBefore=json.loads((out/'task-render-before.json').read_text());renderAfter=json.loads((out/'task-render-after.json').read_text())
assert max(c['rendered'] for r in renderBefore['samples'] for c in r['commits'])==200
assert max(c['rendered'] for r in renderAfter['samples'] for c in r['commits'])==1
glass=json.loads((out/'regression/living-sky/liquid-glass/after-performance.json').read_text())
assert glass['fresh_browser_process'] and max(glass['dialog_response_ms'])<500 and max(glass['browser_input_to_paint_ms'])<500 and glass['p95_frame_ms']<70 and glass['frames_over_50ms']<15
assert not subprocess.check_output(['git','diff','HEAD','--','app/taskSchedule.ts','app/dailyPlanning.ts','app/projectPace.ts','app/projectRest.ts','app/LivingSky.tsx','app/livingSky.ts','app/livingSky.css','package.json','package-lock.json','vite.config.ts','playwright.config.ts'],cwd=root)
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip()=='1d21cd23453b15ecb4116e24447e0a71f8cff3dc'
result={'sourceAndBuildUnchangedSinceFinalFreeze':True,'unitPassed':700,'browserPassed':333,'nativePwaChecksPassed':12,'failed':0,'skipped':0,'flaky':0,'newUnitTests':86,'newBrowserTests':18,'schemaChanged':True,'schemaFrom':7,'schemaTo':8,'tablesAdded':['habitAssessments'],'original19TablesAndIndexesUnchanged':True,'snapshotVersion':6,'taskRowsRenderedBefore':200,'taskRowsRenderedAfter':1,'physicalAndroidTested':False,'published':False,'pushed':False,'candidateSha256':sha(out/'candidate.zip')}
(out/'final-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
