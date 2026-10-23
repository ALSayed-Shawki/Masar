// Group report → PNG image or PDF, shared through the phone's share sheet (WhatsApp, etc.).
// Arabic text is rendered by the browser into an image first, so the PDF keeps correct shaping.
import { $, esc, toast } from '../../core/dom.js';
import { fmtShort, today } from '../../core/dates.js';
import { money, balances, periodReport } from './math.js';
import { G, mName } from './data.js';
import { periodRange, periodLabel, splitText } from './views.js';

const H2I = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm';
const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';

function loadScript(src) {
  return new Promise((ok, fail) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    const s = Object.assign(document.createElement('script'), { src, onload: ok, onerror: () => fail(new Error('load ' + src)) });
    document.head.append(s);
  });
}

function reportHtml(period) {
  const [a, z] = periodRange(period), r = periodReport(G.members, G.expenses, a, z);
  const { b, tr } = balances(G.members, G.expenses, G.settlements);
  const cur = esc(G.group.currency || 'ريال');
  const range = period === 'all' ? 'من أول الحساب' : `${fmtShort(a)} – ${fmtShort(z > today() ? today() : z)}`;
  const rows = [...r.group].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 40);
  return `<div class="report">
    <div><h1>${esc(G.group.name)} · ${esc(periodLabel(period))}</h1><div class="sub">${range}</div></div>
    <div class="tot"><div>صرف الشلة<b>${money(r.total)}</b></div><div>عدد المصاريف<b>${r.group.length}</b></div></div>
    <div class="box"><h2>الفترة دي</h2><table><tr><th>الاسم</th><th>دفع</th><th>استهلك</th></tr>
      ${G.members.map(m => `<tr><td>${esc(m.name)}</td><td class="n">${money(r.per[m.id].paid)}</td><td class="n">${money(r.per[m.id].used)}</td></tr>`).join('')}</table></div>
    <div class="box"><h2>الرصيد الحالي (كل الفترات)</h2><table>
      ${G.members.map(m => { const n = b[m.id].net; return `<tr><td>${esc(m.name)}</td><td>${n > 0 ? 'ليه' : n < 0 ? 'عليه' : 'متساوي'}</td><td class="n ${n > 0 ? 'p' : n < 0 ? 'm' : ''}">${money(Math.abs(n))} ${cur}</td></tr>`; }).join('')}</table>
      ${tr.length ? `<h2 style="margin-top:12px">التسوية</h2><table>${tr.map(t => `<tr><td>${esc(mName(t.from))} يدفع لـ${esc(mName(t.to))}</td><td class="n">${money(t.c)} ${cur}</td></tr>`).join('')}</table>` : ''}</div>
    ${Object.keys(r.cats).length ? `<div class="box"><h2>حسب البند</h2><table>${Object.entries(r.cats).sort((x, y) => y[1] - x[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${money(v)}</td></tr>`).join('')}</table></div>` : ''}
    ${rows.length ? `<div class="box"><h2>المصاريف</h2><table><tr><th>التاريخ</th><th>البيان</th><th>دفع</th><th>التقسيم</th><th>المبلغ</th></tr>
      ${rows.map(e => `<tr><td>${fmtShort(e.date)}</td><td>${esc(e.title)}</td><td>${esc(mName(e.payer_id))}</td><td>${esc(splitText(e))}</td><td class="n">${money(e.amount_c)}</td></tr>`).join('')}</table>
      ${r.group.length > rows.length ? `<div class="foot">وأقدم منهم ${r.group.length - rows.length} مصروف في التطبيق.</div>` : ''}</div>` : ''}
    <div class="foot">اتعمل من تطبيق حساب الشلة · ${fmtShort(today())}</div></div>`;
}

export async function shareReport(period, format) {
  const stage = $('#report-stage');
  stage.innerHTML = reportHtml(period);
  const node = stage.firstElementChild;
  try {
    const { toBlob } = await import(H2I);
    await document.fonts?.ready;
    const png = await toBlob(node, { pixelRatio: 2, backgroundColor: '#FFFDF8', cacheBust: true });
    if (!png) throw new Error('image');
    const name = `shela-${period}-${today()}`;
    let file;
    if (format === 'pdf') {
      await loadScript(JSPDF);
      const { jsPDF } = window.jspdf;
      const img = await createImageBitmap(png);
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      const scale = pw / img.width, sliceH = Math.floor(ph / scale);
      const c = document.createElement('canvas'); c.width = img.width;
      for (let y = 0, page = 0; y < img.height; y += sliceH, page++) {
        const h = Math.min(sliceH, img.height - y); c.height = h;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#FFFDF8'; ctx.fillRect(0, 0, c.width, h); ctx.drawImage(img, 0, y, img.width, h, 0, 0, img.width, h);
        if (page) pdf.addPage();
        pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pw, h * scale);
      }
      file = new File([pdf.output('blob')], name + '.pdf', { type: 'application/pdf' });
    } else {
      file = new File([png], name + '.png', { type: 'image/png' });
    }
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `تقرير ${G.group.name}`, text: `تقرير ${G.group.name} · ${periodLabel(period)}` });
    } else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
      document.body.append(a); a.click(); a.remove();
      toast('اتنزّل؛ ابعته من الواتساب كملف');
    }
  } finally { stage.innerHTML = ''; }
}
