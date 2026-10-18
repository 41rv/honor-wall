from pathlib import Path
import hashlib,json,zipfile,datetime
root=Path(__file__).resolve().parents[2];out=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source={str(p.relative_to(root)):sha(p) for scope in ['app','tests'] for p in sorted((root/scope).rglob('*')) if p.is_file()}
for n in ['package.json','package-lock.json','vite.config.ts','playwright.config.ts','tsconfig.json']:source[n]=sha(root/n)
build={str(p.relative_to(root/'build')):sha(p) for p in sorted((root/'build').rglob('*')) if p.is_file()}
(out/'candidate-manifest.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'label':'experience-phase1-local','base':'/honor-wall/','source':source,'build':build,'published':False,'pushed':False},indent=2)+'\n')
with zipfile.ZipFile(out/'candidate.zip','w',zipfile.ZIP_DEFLATED) as z:
 for n in build:z.write(root/'build'/n,n)
print('Frozen:',len(source),'source files;',len(build),'production files; candidate SHA',sha(out/'candidate.zip'))
