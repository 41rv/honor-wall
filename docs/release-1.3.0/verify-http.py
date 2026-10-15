import concurrent.futures, datetime, hashlib, json, pathlib, subprocess, sys, tempfile
root = pathlib.Path(sys.argv[1])
report = pathlib.Path(sys.argv[2])
commit = sys.argv[3]
site = 'https://41rv.github.io/honor-wall/'
files = [p for p in root.rglob('*') if p.is_file() and '.git' not in p.relative_to(root).parts and p.name != '.nojekyll']
def check(file):
    relative = str(file.relative_to(root))
    with tempfile.NamedTemporaryFile() as output:
        url = site + relative
        subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','30','--header','Cache-Control: no-cache','--output',output.name,url],check=True)
        actual = pathlib.Path(output.name).read_bytes()
    expected = file.read_bytes()
    digest = lambda v: hashlib.sha256(v).hexdigest()
    return dict(path=relative,expected_sha256=digest(expected),actual_sha256=digest(actual),matches=actual == expected)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(check,files))
with tempfile.NamedTemporaryFile() as output:
    subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','30','--header','Cache-Control: no-cache','--output',output.name,site],check=True)
    entry = pathlib.Path(output.name).read_bytes()
entry_matches = entry == (root/'index.html').read_bytes()
result = dict(timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),release='1.3.0',commit=commit,url=site,tls_verification='curl default enabled; no insecure option',all_match=all(r['matches'] for r in results) and entry_matches,root_entry_matches=entry_matches,files=results)
report.parent.mkdir(parents=True,exist_ok=True)
report.write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(dict(all_match=result['all_match'],root_entry_matches=entry_matches,files=len(results),mismatches=[r['path'] for r in results if not r['matches']])))
if not result['all_match']:sys.exit(1)
