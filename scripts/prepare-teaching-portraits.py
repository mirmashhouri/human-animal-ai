"""Download a resumable, attributed Wikimedia starter set. No model/API-key access."""
import argparse, concurrent.futures, hashlib, html, io, json, re, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

PEOPLE = '''Tom Hanks|Viola Davis|Denzel Washington|Meryl Streep|Morgan Freeman|Helen Mirren|Hugh Jackman|Cate Blanchett|Idris Elba|Tilda Swinton|Benedict Cumberbatch|Lupita Nyong'o|Daniel Craig|Michelle Yeoh|Keanu Reeves|Sandra Bullock|Willem Dafoe|Emma Thompson|Javier Bardem|Penélope Cruz|Adrien Brody|Salma Hayek|Adam Driver|Anne Hathaway|Dev Patel|Deepika Padukone|Shah Rukh Khan|Priyanka Chopra|Amitabh Bachchan|Aishwarya Rai Bachchan|Jackie Chan|Lucy Liu|Ken Watanabe|Gong Li|Song Kang-ho|Bae Doona|Tony Leung Chiu-wai|Zhang Ziyi|Mads Mikkelsen|Marion Cotillard|Vincent Cassel|Audrey Tautou|Omar Sy|Léa Seydoux|Antonio Banderas|Sofía Vergara|Gael García Bernal|Ana de Armas|Ricardo Darín|Sônia Braga|Joaquin Phoenix|Frances McDormand|Jeff Goldblum|Whoopi Goldberg|Steve Buscemi|Octavia Spencer|Danny DeVito|Kathy Bates|John Turturro|Jamie Lee Curtis|Rami Malek|Olivia Colman|Mahershala Ali|Angela Bassett|Daniel Kaluuya|Regina King|Cillian Murphy|Saoirse Ronan|Andrew Garfield|Florence Pugh|Oscar Isaac|Jessica Chastain|Pedro Pascal|Zendaya|Robert Downey Jr.|Scarlett Johansson|Mark Ruffalo|Natalie Portman|Chris Hemsworth|Charlize Theron|Christian Bale|Kate Winslet|Leonardo DiCaprio|Kate Beckinsale|Brad Pitt|Halle Berry|George Clooney|Julia Roberts|Dustin Hoffman|Susan Sarandon|Al Pacino|Diane Keaton|Robert De Niro|Isabelle Huppert|Asghar Farhadi|Taraneh Alidoosti|Shahab Hosseini|Golshifteh Farahani|Payman Maadi|Leila Hatami|Ali Mosaffa|Niki Karimi|Mohammad Reza Shajarian|Googoosh|Sting (musician)|Annie Lennox|David Bowie|Björk|Elton John|Dolly Parton|Stevie Wonder|Tina Turner|Snoop Dogg|Alicia Keys|Bruno Mars|Adele|Ed Sheeran|Lady Gaga|Freddie Mercury|Grace Jones|Roger Federer|Serena Williams|Rafael Nadal|Venus Williams|Novak Djokovic|Naomi Osaka|Cristiano Ronaldo|Marta (footballer)|Lionel Messi|Megan Rapinoe|LeBron James|Simone Biles|Usain Bolt|Allyson Felix|Stephen Curry|Lindsey Vonn|Lewis Hamilton|Mikaela Shiffrin|David Beckham|Alex Morgan|Jason Momoa|Sigourney Weaver|Patrick Stewart|Judi Dench|Ian McKellen|Maggie Smith|Bill Murray|Geena Davis|Michael Caine|Julie Andrews'''.split('|')

def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', '', value or ''))).strip()

def get(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': 'WildLensTeaching/1.0 (https://github.com/mirmashhouri/human-animal-ai; local annotation prototype)'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=35) as response:
                data = response.read(12 * 1024 * 1024)
                return data if binary else json.loads(data)
        except Exception as error:
            if attempt == 4: raise
            retry = error.headers.get('Retry-After', '0') if isinstance(error, urllib.error.HTTPError) else '0'
            wait = max(5 * 2**attempt, int(retry) if retry.isdigit() else 0)
            if wait > 0: print(f'Source backoff: {min(wait,59)} seconds', flush=True)
            time.sleep(min(wait,59))

def api(host, **params):
    return get('https://' + host + '/w/api.php?' + urllib.parse.urlencode({'format': 'json', **params}))

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--output', required=True); parser.add_argument('--count', type=int, default=100)
    args = parser.parse_args(); root = Path(args.output).resolve(); photos = root / 'photos'; photos.mkdir(parents=True, exist_ok=True)
    manifest_path = root / 'manifest.json'
    records = json.loads(manifest_path.read_text('utf-8')) if manifest_path.exists() else []
    done = {r['person'] for r in records}; candidates = []
    cache = root / 'candidates.json'
    if cache.exists(): candidates = [tuple(c) for c in json.loads(cache.read_text('utf-8')) if c[0] not in done]
    else:
        for start in range(0, len(PEOPLE), 20):
            batch = api('en.wikipedia.org', action='query', prop='pageimages', titles='|'.join(PEOPLE[start:start+20]), piprop='name', redirects=1)
            for page in batch.get('query', {}).get('pages', {}).values():
                if page.get('pageimage') and page['title'] not in done: candidates.append((page['title'], page['pageimage']))
            time.sleep(.5)
        cache.write_text(json.dumps(candidates, ensure_ascii=False), 'utf-8')
    # Keep the curated alternating order rather than MediaWiki's numeric page order.
    order = {name: i for i, name in enumerate(PEOPLE)}; candidates.sort(key=lambda x: order.get(x[0], 10000))
    metadata_file = root / 'source-metadata.json'
    metadata = json.loads(metadata_file.read_text('utf-8')) if metadata_file.exists() else {}
    for start in range(0, len(candidates)):
        needed = [name for _, name in candidates[start:start+1] if name.replace('_', ' ') not in metadata]
        if not needed: continue
        try: result = api('en.wikipedia.org', action='query', prop='imageinfo', titles='|'.join('File:' + name for name in needed), iiprop='url|extmetadata|size', iiurlwidth=640)
        except Exception as error:
            print(f'Metadata skipped: {candidates[start][0]} ({str(error)[:70]})', flush=True); continue
        for page in result.get('query', {}).get('pages', {}).values():
            if page.get('imageinfo'): metadata[page['title'][5:].replace('_', ' ')] = page['imageinfo'][0]
        metadata_file.write_text(json.dumps(metadata, ensure_ascii=False), 'utf-8')
        time.sleep(.8)
    failures = []
    def download(candidate):
        person, name = candidate; info = metadata.get(name.replace('_', ' '))
        if not info: return None
        meta = info.get('extmetadata', {}); val = lambda key: plain(meta.get(key, {}).get('value', ''))
        license_name = val('LicenseShortName'); license_url = val('LicenseUrl')
        if not (re.match(r'^CC (BY|BY-SA|0)( |$)', license_name, re.I) or 'public domain' in license_name.lower()): return None
        if not license_url and 'public domain' in license_name.lower(): license_url = 'https://creativecommons.org/publicdomain/mark/1.0/'
        if not license_url.startswith(('https://creativecommons.org/', 'http://creativecommons.org/')): return None
        url = info.get('thumburl', info['url'])
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(get(url, True)))).convert('RGB')
        if min(image.size) < 180: return None
        image.thumbnail((1200, 1400)); slug = re.sub(r'[^a-z0-9]+', '-', person.lower()).strip('-')[:60]
        filename = slug + '-' + hashlib.sha256(name.encode()).hexdigest()[:8] + '.jpg'
        image.save(photos / filename, quality=90, optimize=True)
        return {'person': person, 'file': 'photos/' + filename, 'sourcePage': info['descriptionurl'], 'sourceImage': info['url'],
            'wikipediaPage': 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(person.replace(' ', '_')),
            'author': val('Artist'), 'credit': val('Credit'), 'license': license_name, 'licenseUrl': license_url,
            'modifications': 'Resized, orientation normalized, converted to JPEG; no face or animal labels added.',
            'sha256': hashlib.sha256((photos / filename).read_bytes()).hexdigest(), 'width': image.width, 'height': image.height}
    # Small bounded concurrency, resumable after every successful file.
    for start in range(0, len(candidates), 3):
        if len(records) >= args.count: break
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            jobs = [(candidate, pool.submit(download, candidate)) for candidate in candidates[start:start+min(3,args.count-len(records))]]
            for candidate, job in jobs:
                try:
                    record = job.result()
                    if record and len(records) < args.count:
                        records.append(record); manifest_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), 'utf-8')
                        print(f'{len(records)}/{args.count} {record["person"]} - {record["license"]}', flush=True)
                except Exception as error: failures.append({'person': candidate[0], 'error': str(error)[:250]})
        time.sleep(.3)
    (root / 'download-failures.json').write_text(json.dumps(failures, ensure_ascii=False, indent=2), 'utf-8')
    (root / 'ATTRIBUTION.txt').write_text('\n\n'.join(f'{r["person"]}\n{r["file"]}\n{r["author"]}\n{r["license"]}: {r["licenseUrl"]}\n{r["sourcePage"]}\n{r["modifications"]}' for r in records), 'utf-8')
    for start in range(0, len(records), 25):
        sheet = Image.new('RGB', (1000, 1200), 'white'); draw = ImageDraw.Draw(sheet)
        for i, record in enumerate(records[start:start+25]):
            image = Image.open(root / record['file']); image.thumbnail((190, 205)); x=(i%5)*200; y=(i//5)*240
            sheet.paste(image, (x+(200-image.width)//2, y)); draw.text((x+5,y+210), f'{start+i+1}. {record["person"]}'[:29], fill='black')
        sheet.save(root / f'contact-sheet-{start//25+1}.jpg', quality=90)
    print(json.dumps({'downloaded': len(records), 'folder': str(root), 'failures': len(failures)}))
    if len(records) < args.count: raise SystemExit('Starter set incomplete; rerun to resume.')

if __name__ == '__main__': main()
