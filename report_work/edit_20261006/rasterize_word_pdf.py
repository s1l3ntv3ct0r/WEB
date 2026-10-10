from pathlib import Path
import json
import re
import pypdfium2 as pdfium
from pdf2image import convert_from_path

work = Path(__file__).resolve().parent
pdf = pdfium.PdfDocument(work / 'final.pdf')
output = work / 'final_render'
output.mkdir(exist_ok=True)
pages = []
poppler = r'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
convert_from_path(str(work / 'final.pdf'), dpi=118, fmt='png', output_folder=str(output), output_file='page', paths_only=True, poppler_path=poppler, thread_count=2)
for path in output.glob('page*.png'):
    if re.fullmatch(r'page-\d+', path.stem):
        continue
    match = re.search(r'-(\d+)$', path.stem)
    if match:
        page_number = int(match.group(1))
        target = output / f'page-{page_number}.png'
        path.replace(target)
for i, page in enumerate(pdf):
    pages.append({'page': i + 1, 'text': page.get_textpage().get_text_range()})
(work / 'rendered_text.json').write_text(json.dumps(pages, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'pages': len(pdf), 'images': str(output)}, ensure_ascii=False))
