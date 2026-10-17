"""Archive fresh regression outputs, restore exact pre-phase3 evidence copies.
Never restore app/tests or reset the working tree; previous approved work stays.
"""
from pathlib import Path
import json,hashlib,shutil
root=Path(__file__).resolve().parents[2]
out=root/'docs/habits-phase3'
baseline=json.loads((out/'baseline.json').read_text())['files']
original=Path('/tmp/masar-phase3-docs-before')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
changed=[]
for rel,digest in baseline.items():
 if not rel.startswith('docs/'):continue
 current=root/rel
 if not current.is_file():raise RuntimeError('Missing preexisting file: '+rel)
 if sha(current)==digest:continue
 prior=original/Path(rel).relative_to('docs')
 if not prior.is_file() or sha(prior)!=digest:raise RuntimeError('No matching preserved copy: '+rel)
 target=out/'regression'/rel
 target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(current,target)
 changed.append({'source':rel,'archive':str(target.relative_to(root)),'new_sha256':sha(current),'prior_sha256':digest})
 shutil.copy2(prior,current)
 assert sha(current)==digest
new=[]
allowed=('docs/tasks/','docs/interface-organization/','docs/living-sky/','docs/living-sky-shell/','docs/smooth-controls/','docs/internal-controls/','docs/navigation-phase1/')
for p in (root/'docs').rglob('*'):
 if not p.is_file():continue
 rel=str(p.relative_to(root))
 if rel.startswith('docs/habits-phase3/') or rel in baseline:continue
 if not rel.startswith(allowed):raise RuntimeError('Review unexpected new output: '+rel)
 target=out/'regression'/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
 new.append({'source':rel,'archive':str(target.relative_to(root)),'sha256':sha(p)})
 p.unlink()
(out/'regression-artifacts.json').write_text(json.dumps({'archived_existing_outputs':changed,'archived_new_outputs':new,'prior_docs_restored_exactly':True,'source_files_restored_or_reset':False},ensure_ascii=False,indent=2)+'\n')
print(f'Archived {len(changed)} refreshed outputs and {len(new)} new outputs; exact original evidence restored without Git reset or source edits.')
