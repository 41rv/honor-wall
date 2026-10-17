from pathlib import Path
import hashlib,json,shutil
r=Path(__file__).resolve().parents[2];out=r/'docs/habits-phase4-7';before=Path('/tmp/masar-phase4-7-before/docs')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
changes=[];new=[]
for p in before.rglob('*'):
 if not p.is_file() or 'habits-phase4-7' in p.parts:continue
 rel=p.relative_to(before);target=r/'docs'/rel
 if not target.exists() or sha(target)!=sha(p):
  changes.append(str(rel))
  if target.exists():
   saved=out/'regression'/rel;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
  target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
for target in (r/'docs').rglob('*'):
 if not target.is_file() or out in target.parents:continue
 rel=target.relative_to(r/'docs')
 if not (before/rel).exists():
  saved=out/'regression'/rel;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved);target.unlink();new.append(str(rel))
result={'changed_regression_outputs_archived':changes,'new_regression_outputs_archived':new,'preexisting_docs_restored_exactly':True,'git_reset_used':False}
(out/'regression-artifacts.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(len(changes),'existing outputs restored;',len(new),'new outputs archived')
