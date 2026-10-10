from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import subprocess
import json
import pypdfium2 as pdfium

work = Path(__file__).resolve().parent
pdf_path = work / 'final.pdf'
output = work / 'final_render'
output.mkdir(exist_ok=True)
poppler = Path(r'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
pdf = pdfium.PdfDocument(pdf_path)
pages = [{'page': i + 1, 'text': page.get_textpage().get_text_range()} for i, page in enumerate(pdf)]
pdf.close()
(work / 'rendered_text.json').write_text(json.dumps(pages, ensure_ascii=False, indent=2), encoding='utf-8')

def render_page(number):
    command = [str(poppler), '-f', str(number), '-l', str(number), '-singlefile', '-r', '118', '-png', str(pdf_path), str(output / f'page-{number}')]
    subprocess.run(command, check=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    return number

with ThreadPoolExecutor(max_workers=4) as executor:
    futures = [executor.submit(render_page, n) for n in range(1, len(pages) + 1)]
    for index, future in enumerate(as_completed(futures), 1):
        future.result()
        if index % 10 == 0:
            print(f'Rendered {index}/{len(pages)} pages', flush=True)
print(json.dumps({'pages': len(pages), 'images': str(output)}, ensure_ascii=False))
