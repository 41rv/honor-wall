"""Keep fresh regression evidence separate from tracked historical reports."""
from pathlib import Path
import json,hashlib,subprocess,shutil
root=Path(__file__).resolve().parents[2];out=root/'docs/habits-phase2'
base=json.loads((out/'baseline.json').read_text())['files']
tracked=set(subprocess.check_output(['git','ls-files','docs'],cwd=root,text=True).splitlines())
records=[];restore=[];refreshed=[]
for rel,old in base.items():
 if not rel.startswith('docs/'):continue
 p=root/rel
 if not p.is_file():raise RuntimeError('Missing preexisting evidence: '+rel)
 current=hashlib.sha256(p.read_bytes()).hexdigest()
 if current==old:continue
 target=out/'regression'/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
 records.append({'source':rel,'archive':str(target.relative_to(root)),'sha256':current})
 if rel in tracked:restore.append(rel)
 elif rel.startswith('docs/navigation-phase1/') and p.suffix=='.png':refreshed.append(rel)
 else:raise RuntimeError('Unexpected change to preexisting untracked evidence: '+rel)
newfiles=[]
for p in (root/'docs').rglob('*'):
 if not p.is_file():continue
 rel=str(p.relative_to(root))
 if rel.startswith('docs/habits-phase2/') or rel in base:continue
 if not rel.startswith(('docs/tasks/','docs/interface-organization/','docs/living-sky/','docs/living-sky-shell/','docs/smooth-controls/','docs/internal-controls/')):raise RuntimeError('Review unexpected new output: '+rel)
 target=out/'regression'/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
 records.append({'source':rel,'archive':str(target.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'new':True});newfiles.append(p)
if restore:subprocess.run(['git','restore','--source=HEAD','--worktree','--',*restore],cwd=root,check=True)
for p in newfiles:p.unlink()
for rel in restore:assert hashlib.sha256((root/rel).read_bytes()).hexdigest()==base[rel]
(out/'regression-artifacts.json').write_text(json.dumps({'archived_outputs':records,'tracked_historical_files_restored':len(restore),'phase1_screenshots_refreshed_by_regression':refreshed,'phase1_reports_before_and_comparison_images_preserved':True},ensure_ascii=False,indent=2)+'\n')
print(f'Archived {len(records)} outputs; restored {len(restore)} tracked historical documents; {len(refreshed)} phase1 after-captures refreshed by actual regression.')
