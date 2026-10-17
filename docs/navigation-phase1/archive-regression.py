"""Preserve fresh regression evidence without rewriting historical reports."""
import hashlib,json,subprocess,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'docs/navigation-phase1'
base=json.loads((out/'baseline.json').read_text())['historical_docs']
tracked=set(subprocess.check_output(['git','ls-files','docs'],cwd=root,text=True).splitlines())
records=[]; restore=[]
for rel,old in base.items():
 p=root/rel
 if p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()!=old:
  if rel not in tracked:raise RuntimeError('Unexpected modified preexisting untracked file: '+rel)
  target=out/'regression'/rel
  target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
  records.append({'source':rel,'archive':str(target.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
  restore.append(rel)
newfiles=[]
for p in (root/'docs').rglob('*'):
 if not p.is_file():continue
 rel=str(p.relative_to(root))
 if rel.startswith('docs/navigation-phase1/') or rel in base:continue
 if not rel.startswith(('docs/tasks/','docs/interface-organization/','docs/living-sky/','docs/living-sky-shell/','docs/smooth-controls/','docs/internal-controls/')):
  raise RuntimeError('Review unexpected new regression artifact before removal: '+rel)
 target=out/'regression'/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
 records.append({'source':rel,'archive':str(target.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'new':True});newfiles.append(p)
if restore:subprocess.run(['git','restore','--source=HEAD','--worktree','--',*restore],cwd=root,check=True)
for p in newfiles:p.unlink()
for rel,old in base.items():
 p=root/rel
 assert p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==old,rel
(out/'regression-artifacts.json').write_text(json.dumps({'historical_files_preserved':len(base),'archived_test_outputs':records},ensure_ascii=False,indent=2)+'\n')
print(f'Archived {len(records)} fresh outputs; restored {len(restore)} historical files; verified {len(base)} historical hashes unchanged.')
