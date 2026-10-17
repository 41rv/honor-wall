from pathlib import Path
import json,hashlib,subprocess
r=Path(__file__).resolve().parents[2];o=r/'docs/habits-phase3'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=json.loads((o/'baseline.json').read_text());old=base['files']
changed=sorted(p for p,h in old.items() if p.startswith('app/') and sha(r/p)!=h)
assert set(changed)=={'app/App.tsx','app/HomeExecution.tsx','app/db.ts','app/PeriodDashboard.tsx','app/AchievementLog.tsx'},changed
original_db=(r/'app/db.ts').read_text().replace('import { trackBackupWrite, flushBackupWrites } from "./backupWrites";','import { trackBackupWrite } from "./backupWrites";').replace('    await flushBackupWrites();\n','',1)
assert hashlib.sha256(original_db.encode()).hexdigest()==old['app/db.ts'],'Unexpected DB/schema change'
for p,h in old.items():
 if p.startswith('docs/'):assert (r/p).exists() and sha(r/p)==h,p
for p in ['app/model.ts','app/habitTypes.ts','app/habitValidation.ts','app/navigation.ts','app/navigation.css','app/WorkspaceNavigation.tsx','app/controls.css','app/main.tsx','app/useRouteMotion.ts','HABITS_PHASE2_REPORT.md','HABITS_PHASE2_DATA_SPEC.md','NAVIGATION_PHASE1_REPORT.md','WEBAPK_NAVIGATION_DIAGNOSIS.md']:
 assert sha(r/p)==old[p],p
existing_test_changes=sorted(p for p,h in old.items() if p.startswith('tests/') and sha(r/p)!=h)
assert set(existing_test_changes)=={'tests/browser/habits-phase2.spec.ts','tests/browser/living-glass.spec.ts','tests/browser/project-pace.spec.ts'},existing_test_changes
j=json.loads((o/'unit-results.json').read_text());assert j['numPassedTests']==540 and j['numFailedTests']==0 and j['numPendingTests']==0
names=['browser-results.json','browser-final-recheck.json','browser-regressions-final.json','browser-loading-final.json']
results={n:json.loads((o/n).read_text()) for n in names}
passed=set();allcases=set()
def walk(suites,parents=()):
 for s in suites:
  title=s['title'];branch=parents if title.endswith('.spec.ts') else (*parents,title)
  for spec in s.get('specs',[]):
   key=(Path(spec['file']).name,*branch,spec['title']);allcases.add(key)
   if all(t.get('results') and t['results'][-1]['status']=='passed' for t in spec['tests']):passed.add(key)
  walk(s.get('suites',[]),branch)
for n,j in results.items():
 assert j['stats']['skipped']==0 and j['stats']['flaky']==0,(n,j['stats'])
 if n=='browser-results.json':assert j['stats']['expected']==277 and j['stats']['unexpected']==3
 else:assert j['stats']['unexpected']==0,(n,j['stats'])
 walk(j['suites'])
assert len(allcases)==282,(len(allcases),len(passed))
assert passed==allcases,(len(passed),len(allcases),allcases-passed)
pwa=json.loads((o/'pwa-result.json').read_text());assert pwa['passed']==12 and pwa['errors']==[] and pwa['schemaBefore']==pwa['schemaAfter']==70
assert (o/'pwa-result.json').stat().st_mtime>=(o/'production-build.log').stat().st_mtime,'PWA proof predates latest production build'
assets=lambda folder:{str(p.relative_to(folder)):sha(p) for p in (folder/'assets').rglob('*') if p.is_file()}
assert assets(r/'build')==assets(Path('/tmp/masar-phase3-final-root')),'Root build differs from tested final candidate'
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip();assert head==base['commit']
source={str(p.relative_to(r)):sha(p) for p in (r/'app').rglob('*') if p.is_file()}
(o/'final-source-under-test.json').write_text(json.dumps(source,indent=2)+'\n')
output={'head':head,'phase':3,'schema':7,'nativeIndexedDB':70,'snapshot':5,'newSchemaMigration':False,'newDefaultRows':0,'changed_existing_production_files_this_phase':changed,'existing_test_adjustments':existing_test_changes,'other_existing_app_files_unchanged':True,'phase1_navigation_source_preserved':True,'phase2_contracts_and_reports_preserved':True,'preexisting_document_hashes_restored_exactly':True,'unit':{'passed':540,'failed':0,'skipped':0,'new':56},'browser':{'first_full_run':results['browser-results.json']['stats'],'final_recheck':results['browser-final-recheck.json']['stats'],'regressions_rechecked':results['browser-regressions-final.json']['stats'],'deterministic_loading_contrast':results['browser-loading-final.json']['stats'],'unique_cases_passed_after_fixes':len(passed),'new':23,'unresolved_test_failures':0,'single_clean_full_282_run':False},'pwa':pwa,'root_assets_match_tested_final_candidate':True,'source_sha256':source,'committed':False,'pushed':False,'published':False,'phase4_started':False,'actual_user_data_accessed':False}
(o/'final-verification.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print('PASS:540 unit/integration;282 unique browser cases passed after fixes;12 PWA checks;no schema change;prior work preserved;no publication.')
