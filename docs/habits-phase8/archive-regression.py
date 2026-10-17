from pathlib import Path
import hashlib,json,shutil
root=Path(__file__).resolve().parents[2];output=root/'docs/habits-phase8';before=Path('/tmp/masar-phase8-before/docs')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
changed=[];new=[]
for original in before.rglob('*'):
 if not original.is_file() or 'habits-phase8' in original.parts:continue
 rel=original.relative_to(before);target=root/'docs'/rel
 if not target.exists() or sha(target)!=sha(original):
  changed.append(str(rel))
  if target.exists():
   saved=output/'regression'/rel;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
  target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(original,target)
for target in (root/'docs').rglob('*'):
 if not target.is_file() or output in target.parents:continue
 rel=target.relative_to(root/'docs')
 if not (before/rel).exists():
  saved=output/'regression'/rel;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved);target.unlink();new.append(str(rel))
(output/'regression-artifacts.json').write_text(json.dumps({'changedOutputsArchived':changed,'newOutputsArchived':new,'previousArtifactsPreservedExactly':True,'gitResetUsed':False},indent=2)+'\n')
print(len(changed),'existing artifacts restored;',len(new),'new artifacts archived')
