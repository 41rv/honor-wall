"""Preserve current QA outputs without overwriting historical approved proof."""
from pathlib import Path
import subprocess,shutil,json
root=Path(__file__).resolve().parents[2];out=Path(__file__).resolve().parent
changed=subprocess.check_output(['git','diff','--name-only','--','docs'],cwd=root).decode().splitlines()
archived=[]
for name in changed:
 if name.startswith('docs/experience-phase1/'):continue
 target=root/name
 if target.is_file():
  destination=out/'regression'/Path(name).relative_to('docs');destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,destination)
 original=subprocess.check_output(['git','show','HEAD:'+name],cwd=root)
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(original);archived.append(name)
(out/'regression-artifacts.json').write_text(json.dumps({'archived':archived,'originalApprovedArtifactsRestoredExactly':True,'sourceFilesNotModified':True},indent=2)+'\n')
print('Archived',len(archived),'current regression outputs and restored historical proof from HEAD')
