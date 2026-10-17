from pathlib import Path
import hashlib,json,subprocess
r=Path(__file__).resolve().parents[2];o=r/'docs/habits-phase4-7';base=json.loads((o/'baseline.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
changed=[p for p,h in base.items() if p.startswith('app/') and sha(r/p)!=h]
assert set(changed)=={'app/App.tsx','app/HomeExecution.tsx','app/habitStore.ts','app/habitCalendar.ts','app/Habits.tsx','app/habits.css'},changed
new=sorted(str(p.relative_to(r)) for p in (r/'app').rglob('*') if p.is_file() and str(p.relative_to(r)) not in base)
assert set(new)=={'app/habitProgression.ts','app/GradedHabits.tsx','app/habitImport.ts','app/HabitImportDialog.tsx','app/reminderStore.ts','app/Reminders.tsx','app/habitAdvice.ts','app/HabitSuggestions.tsx','app/HomeSummaries.tsx','app/useHabitSearch.ts'},new
for p,h in base.items():
 if p.startswith('docs/'):assert (r/p).exists() and sha(r/p)==h,p
for p in ['app/db.ts','app/model.ts','app/habitTypes.ts','app/habitValidation.ts','app/BackupRestore.tsx','app/backupRecovery.ts','app/habitBackupMerge.ts','app/navigation.ts','app/WorkspaceNavigation.tsx','app/useRouteMotion.ts','app/controls.css']:
 assert sha(r/p)==base[p],p
changedtests=[p for p,h in base.items() if p.startswith('tests/') and sha(r/p)!=h]
assert set(changedtests)=={'tests/browser/internal-controls.spec.ts','tests/browser/living-glass.spec.ts','tests/browser/ux.spec.ts'},changedtests
j=json.loads((o/'final-unit.json').read_text());assert j['numPassedTests']==613 and j['numFailedTests']==0 and j['numPendingTests']==0
results={n:json.loads((o/n).read_text()) for n in ['browser-full.json','browser-final-affected.json','browser-final-regressions.json','browser-final-ux.json']}
passed=set();allcases=set()
def walk(suites,parents=()):
 for suite in suites:
  title=suite['title'];branch=parents if title.endswith('.spec.ts') else (*parents,title)
  for spec in suite.get('specs',[]):
   key=(Path(spec['file']).name,*branch,spec['title']);allcases.add(key)
   if all(t.get('results') and t['results'][-1]['status']=='passed' for t in spec['tests']):passed.add(key)
  walk(suite.get('suites',[]),branch)
for n,result in results.items():
 assert result['stats']['skipped']==0 and result['stats']['flaky']==0,(n,result['stats'])
 if n!='browser-full.json':assert result['stats']['unexpected']==0,(n,result['stats'])
 walk(result['suites'])
assert allcases==passed,(len(allcases),len(passed),allcases-passed)
assert len(allcases)==306,(len(allcases),len(passed))
pwa=json.loads((o/'pwa-result.json').read_text());assert pwa['passed']==17 and pwa['errors']==[] and pwa['schemaBefore']==pwa['schemaAfter']==70
assert (o/'pwa-result.json').stat().st_mtime>=(o/'production-build.log').stat().st_mtime
assets=lambda folder:{str(p.relative_to(folder)):sha(p) for p in (folder/'assets').rglob('*') if p.is_file()}
assert assets(r/'build')==assets(Path('/tmp/masar-phase47-final-root')),'Final build differs from tested candidate'
source={str(p.relative_to(r)):sha(p) for p in (r/'app').rglob('*') if p.is_file()}
assert source==json.loads((o/'final-source-under-test.json').read_text()),'Source changed after browser/PWA validation'
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip();assert head=='8d03d7401e8452f629db895b827bcf295557fcc4'
assert subprocess.check_output(['git','diff','--','package.json','package-lock.json','vite.config.ts'],cwd=r,text=True)==''
result={'head':head,'phases':[4,5,6,7],'schema':7,'nativeIndexedDB':70,'snapshot':5,'newSchemaMigration':False,'preexistingDocsPreserved':True,'allPreexistingAppFilesOutsideSixChangesPreserved':True,'changedExistingAppFiles':changed,'newAppFiles':new,'existingTestAdjustments':changedtests,'unit':{'passed':613,'failed':0,'skipped':0,'new':73},'browser':{'initialFull':results['browser-full.json']['stats'],'finalAffected':results['browser-final-affected.json']['stats'],'finalRegressions':results['browser-final-regressions.json']['stats'],'finalUX':results['browser-final-ux.json']['stats'],'uniquePassedAfterFixes':len(passed),'new':24,'unresolvedFailures':0,'singleClean306Run':False},'pwa':pwa,'rootBuildMatchesTestedCandidate':True,'sourceSha256':source,'committed':False,'pushed':False,'published':False,'phase8Started':False,'nutritionImplemented':False,'personalUserDataAccessed':False,'physicalAndroidBackupDownloadRequiredBeforePublication':True}
(o/'final-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('PASS:',len(passed),'unique browser cases;613unit;17PWA;schema7/Snapshot5 unchanged; no push/publication')
