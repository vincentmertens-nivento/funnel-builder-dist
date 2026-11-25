/*
 * Advertorial body builder: turns an ordered list of body items (+ comments) into ONE self-contained
 * HTML block for the advertorial master's HTML element. Runs in Node (CLI / tests) and in the browser
 * (the fill userscript, or pasted into a page to preview).
 *
 *   node tools/advertorial_html.js content/<product>_advertorial.json            -> HTML fragment on stdout
 *   node tools/advertorial_html.js content/<product>_advertorial.json --preview f -> full preview page
 *
 * Content keys:
 *   "body":     [ items in source order ]
 *   "comments": { "title": "Reacties", "items": [ {name, text, likes, time, avatar, reply_to} ] }
 *   "advertorial": { "primary", "highlight", "cta_selector", "cta_fallback_url" }
 *
 * Item types (text accepts **bold**, *italic*, ==highlight==; blank line = new paragraph; newline = <br>):
 *   h2 {text} · text {text} · list {items, style: check|bullet|number|warning|cross}
 *   image {url, alt?, caption?} · video {url, thumbnail?} · cta {text, subtext?}
 *   review {name, avatar?, stars?, title?, text} · box {label?, text?, image?, items?:[{icon?, text}]}
 *   rating {score, count, rows:[[5,90],[4,7],...]} · quote {text, by?} · note {text} · divider · html {html}
 */
(function (root) {
  'use strict';
  const E = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function inline(s) {
    return E(s)
      .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/==([\s\S]+?)==/g, '<mark>$1</mark>')
      .replace(/(^|[^\w*])\*(?!\s)([^*]+?)(?<!\s)\*(?![\w*])/g, '$1<em>$2</em>')
      .replace(/\n/g, '<br>');
  }
  const paras = (s, cls) => String(s == null ? '' : s).split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p${cls ? ` class="${cls}"` : ''}>${inline(p)}</p>`).join('');
  const stars = n => { n = Math.max(0, Math.min(5, parseInt(n || 5, 10))); return `<span class="advb-stars" aria-label="${n} van 5 sterren">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`; };

  const R = {
    h2: it => `<h2>${inline(it.text)}</h2>`,
    text: it => paras(it.text),
    list: it => {
      const style = it.style || 'bullet', tag = style === 'number' ? 'ol' : 'ul';
      return `<${tag} class="advb-list advb-list-${E(style)}">${(it.items || []).map(x => `<li>${inline(x)}</li>`).join('')}</${tag}>`;
    },
    image: it => `<figure><img src="${E(it.url)}" alt="${E(it.alt || '')}" loading="lazy"${it.width ? ` style="max-width:${parseInt(it.width, 10)}px"` : ''}>${it.caption ? `<figcaption>${inline(it.caption)}</figcaption>` : ''}</figure>`,
    video: it => `<figure><video src="${E(it.url)}"${it.thumbnail ? ` poster="${E(it.thumbnail)}"` : ''} autoplay muted loop playsinline preload="metadata"></video></figure>`,
    cta: it => `<div class="advb-cta-wrap"><a class="advb-cta" href="#" data-advb-cta>${inline(it.text)}${it.subtext ? `<span class="advb-cta-sub">${inline(it.subtext)}</span>` : ''}</a></div>`,
    review: it => `<div class="advb-review"><div class="advb-review-head">${it.avatar ? `<img class="advb-avatar" src="${E(it.avatar)}" alt="">` : ''}<div><strong>${inline(it.name)}</strong><div>${stars(it.stars)} <span class="advb-verified">Geverifieerde koper</span></div></div></div>${it.title ? `<strong class="advb-review-title">${inline(it.title)}</strong>` : ''}${paras(it.text)}</div>`,
    box: it => {
      const rows = (it.items || []).map(r => `<li>${r.icon ? `<img src="${E(r.icon)}" alt="">` : '<span class="advb-tick">✓</span>'}<span>${inline(r.text)}</span></li>`).join('');
      return `<div class="advb-box">${it.label ? `<div class="advb-box-label">${inline(it.label)}</div>` : ''}${it.text ? paras(it.text) : ''}${it.image ? `<img class="advb-box-img" src="${E(it.image)}" alt="">` : ''}${rows ? `<ul class="advb-box-items">${rows}</ul>` : ''}</div>`;
    },
    rating: it => `<div class="advb-rating"><div class="advb-rating-score">${E(it.score || '')}</div><div>${stars(5)}<div class="advb-muted">${inline(it.count || '')}</div></div><div class="advb-bars">${(it.rows || []).map(([n, p]) => `<div class="advb-bar"><span>${n} sterren</span><span class="advb-bar-track"><span style="width:${parseInt(p, 10)}%"></span></span><span>${parseInt(p, 10)}%</span></div>`).join('')}</div></div>`,
    quote: it => `<blockquote>${paras(it.text)}${it.by ? `<cite>${inline(it.by)}</cite>` : ''}</blockquote>`,
    note: it => paras(it.text, 'advb-note'),
    divider: () => '<hr>',
    html: it => String(it.html || '')
  };

  function comments(block) {
    const items = (block && block.items) || [];
    if (!items.length) return '';
    const tops = [], replies = {};
    for (const c of items) (c.reply_to ? (replies[c.reply_to] = replies[c.reply_to] || []) : tops).push(c);
    const one = (c, reply) => `<div class="advb-c${reply ? ' advb-c-reply' : ''}">${c.avatar ? `<img class="advb-c-avatar" src="${E(c.avatar)}" alt="">` : '<span class="advb-c-avatar"></span>'}<div class="advb-c-main"><div class="advb-c-bubble"><strong>${inline(c.name)}</strong>${paras(c.text)}</div><div class="advb-c-meta"><span>Vind ik leuk</span> · <span>Reageren</span>${c.likes ? ` · 👍 ${E(c.likes)}` : ''}${c.time ? ` · ${E(c.time)}` : ''}</div></div></div>`;
    const out = [];
    for (const c of tops) { out.push(one(c, false)); (replies[c.name] || []).forEach(r => out.push(one(r, true))); delete replies[c.name]; }
    Object.values(replies).forEach(list => list.forEach(r => out.push(one(r, false))));   // parent was dropped
    return `<section class="advb-comments"><h3>${inline(block.title || 'Reacties')}</h3><div class="advb-c-write">Schrijf een reactie…</div>${out.join('')}</section>`;
  }

  const CSS = `
.advb{--p:%P%;--hl:%HL%;--ink:#1c1e21;--muted:#65676b;--line:#dddfe2;--soft:#f0f2f5;font-family:inherit;color:var(--ink);font-size:18px;line-height:1.6;max-width:100%;overflow-wrap:break-word}
.advb *{box-sizing:border-box}
.advb p{margin:0 0 16px}
.advb h2{font-size:26px;line-height:1.25;margin:32px 0 14px;font-weight:800}
.advb mark{background:var(--hl);color:inherit;padding:0 2px}
.advb a{color:var(--p)}
.advb figure{margin:20px 0;text-align:center}
.advb figure img,.advb figure video{display:block;width:100%;height:auto;border-radius:6px;margin:0 auto}
.advb figcaption{font-size:14px;color:var(--muted);margin-top:6px}
.advb-list{margin:0 0 18px;padding-left:0;list-style:none}
.advb-list li{position:relative;padding-left:30px;margin:0 0 8px}
.advb-list li::before{position:absolute;left:0;top:0;font-weight:700}
.advb-list-check li::before{content:"✓";color:var(--p)}
.advb-list-bullet li::before{content:"•";color:var(--p)}
.advb-list-warning li::before{content:"⚠️"}
.advb-list-cross li::before{content:"✗";color:#c0392b}
.advb-list-number{counter-reset:n}
.advb-list-number li{counter-increment:n}
.advb-list-number li::before{content:counter(n) ".";color:var(--p)}
.advb-cta-wrap{text-align:center;margin:24px 0}
.advb-cta{display:inline-block;width:100%;max-width:520px;background:var(--p);color:#fff!important;text-decoration:none;font-weight:700;font-size:20px;padding:16px 20px;border-radius:8px}
.advb-cta-sub{display:block;font-size:14px;font-weight:400;opacity:.9;margin-top:2px}
.advb-stars{color:#f5a623;letter-spacing:1px}
.advb-review{border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 14px;background:#fff}
.advb-review-head{display:flex;gap:12px;align-items:center;margin-bottom:8px}
.advb-avatar{width:60px;height:60px;border-radius:50%;object-fit:cover;flex:none}
.advb-verified{font-size:13px;color:#2e7d32}
.advb-review-title{display:block;margin-bottom:6px}
.advb-box{border:2px dashed var(--p);border-radius:10px;padding:18px;margin:24px 0;background:var(--soft)}
.advb-box-label{display:inline-block;background:#c0392b;color:#fff;font-weight:700;font-size:14px;padding:2px 8px;border-radius:4px;margin-bottom:10px}
.advb-box-img{display:block;max-width:320px;width:100%;margin:10px auto}
.advb-box-items{list-style:none;padding:0;margin:10px 0 0}
.advb-box-items li{display:flex;gap:10px;align-items:center;margin:0 0 8px}
.advb-box-items img{width:28px;height:28px;object-fit:contain;flex:none}
.advb-tick{color:var(--p);font-weight:700}
.advb-rating{display:flex;flex-wrap:wrap;gap:16px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:16px;margin:20px 0}
.advb-rating-score{font-size:44px;font-weight:800;line-height:1}
.advb-muted{color:var(--muted);font-size:14px}
.advb-bars{flex:1 1 240px;min-width:0}
.advb-bar{display:flex;gap:8px;align-items:center;font-size:14px;margin:3px 0}
.advb-bar>span:first-child{width:64px;flex:none}
.advb-bar>span:last-child{width:36px;text-align:right;flex:none}
.advb-bar-track{flex:1;height:8px;background:var(--line);border-radius:4px;overflow:hidden}
.advb-bar-track span{display:block;height:100%;background:#f5a623}
.advb blockquote{margin:20px 0;padding:12px 18px;border-left:4px solid var(--p);background:var(--soft);font-style:italic}
.advb blockquote cite{display:block;font-style:normal;font-weight:700;margin-top:6px}
.advb-note{font-size:13px;color:var(--muted);line-height:1.5}
.advb hr{border:0;border-top:1px solid var(--line);margin:28px 0}
.advb-comments{margin-top:36px;font-size:15px;line-height:1.4}
.advb-comments h3{font-size:20px;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.advb-c-write{border:1px solid var(--line);border-radius:20px;padding:8px 14px;color:var(--muted);margin-bottom:16px}
.advb-c{display:flex;gap:8px;margin:0 0 12px}
.advb-c-reply{margin-left:45px}
.advb-c-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;flex:none;background:var(--line)}
.advb-c-reply .advb-c-avatar{width:40px;height:40px}
.advb-c-main{min-width:0}
.advb-c-bubble{background:var(--soft);border-radius:16px;padding:8px 12px}
.advb-c-bubble strong{display:block;font-size:14px}
.advb-c-bubble p{margin:2px 0 0}
.advb-c-meta{font-size:12px;color:var(--muted);margin:3px 0 0 12px}
.advb-c-meta span{font-weight:700}
@media (max-width:600px){.advb{font-size:17px}.advb h2{font-size:22px}.advb-cta{font-size:18px}.advb-c-reply{margin-left:28px}.advb-rating-score{font-size:36px}}`;

  // CTA clicks press the master's own Funnelish button, so step tracking, URL parameters and split tests keep working.
  const SCRIPT = `<script>(function(){var SEL=%SEL%,FB=%FB%;document.querySelectorAll('.advb [data-advb-cta]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var b=SEL&&document.querySelector(SEL);if(b){(b.querySelector('a,button')||b).click();}else if(FB){location.href=FB+location.search;}});});})();<\/script>`;

  function build(content) {
    const s = content.advertorial || {};
    const css = CSS.replace('%P%', s.primary || '#12504B').replace('%HL%', s.highlight || '#FFE45C').replace(/\s*\n\s*/g, '');
    const body = (content.body || []).map(it => {
      const f = R[it.type];
      if (!f) throw new Error('unknown body item type: ' + it.type);
      return f(it);
    }).join('');
    const script = SCRIPT.replace('%SEL%', JSON.stringify(s.cta_selector || '')).replace('%FB%', JSON.stringify(s.cta_fallback_url || ''));
    return `<style>${css}</style><div class="advb">${body}${comments(content.comments)}</div>${script}`;
  }

  const preview = (fragment, title) => `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${E(title || 'Advertorial preview')}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700;800&display=swap"><style>body{margin:0;font-family:Poppins,system-ui,sans-serif;background:#fff}.col{max-width:760px;margin:0 auto;padding:24px 16px}</style></head><body><div class="col">${fragment}</div></body></html>`;

  const api = { build, preview, inline };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AdvertorialHtml = api;

  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);
    const out = build(JSON.parse(fs.readFileSync(args[0], 'utf8')));
    const p = args.indexOf('--preview');
    if (p >= 0) fs.writeFileSync(args[p + 1], preview(out));
    else process.stdout.write(out);
  }
})(typeof window !== 'undefined' ? window : globalThis);
