/**
 * Ported from planner.html's <style> block. Every selector is scoped
 * under `.planner-doc` so this can be dropped into a page alongside
 * the rest of the app's own CSS without leaking into it (the original
 * was a full standalone page, so its rules targeted html/body/:root
 * directly — those become `.planner-doc` here).
 *
 * The palette is no longer the source file's fixed light values. It
 * was hardcoded to a paper-white ground, which meant the Content Plan
 * rendered as a bright white sheet in dark mode — the one screen in
 * the app that ignored the theme. Each planner variable now points at
 * the app's own theme token, so all three theme states (light, system
 * dark, explicitly chosen dark) are inherited rather than reimplemented
 * here.
 *
 * The hero keeps its own fixed dark pair on purpose: it is meant to
 * read as a title card in both themes, and inverting it to white in
 * dark mode would put a floodlight at the top of the page.
 */
export const PLANNER_CSS = `
.planner-doc{
  --ink:var(--text-1);
  --paper:var(--bg);
  --paper-dim:var(--surface-2);
  --card:var(--surface);

  /* Panels that are deliberately dark in BOTH themes — the hero, the
     format stats, the guarantee block, the floating toolbar. They read
     as title cards, and inverting them would put a floodlight in the
     middle of a dark page.

     They need their own foreground colours precisely because they do
     not flip. The guarantee block used to paint itself with --ink and
     --paper, which DO flip: in dark mode that turned it into a white
     panel, still carrying its hard-coded near-white body text. A whole
     section of the plan was white on white. */
  --panel-bg:#111111;
  --panel-fg:#f5f5f3;
  --panel-fg-dim:#b9b9b6;
  --panel-line:#333333;
  /* The light theme's accent (#8a6a1f) is far too dark to sit on
     #111. These panels use the dark theme's gold in both. */
  --panel-accent:#d4af6a;

  /* The hero was here first and the CSS still refers to it by name.
     Same two colours, one definition. */
  --hero-bg:var(--panel-bg);
  --hero-fg:var(--panel-fg);

  /* Body copy inside cards. Was hard-coded #2a2a2a, which is near-black
     — fine on white paper, invisible on a dark card. */
  --body-text:var(--text-1);

  /* Hover and focus washes. Hard-coded rgba(26,26,26,…) inks darkened
     an already-dark surface, so on the dark theme nothing appeared to
     respond to the pointer at all. */
  --wash-1:rgba(17,17,17,0.04);
  --wash-2:rgba(17,17,17,0.07);
  --wash-edge:rgba(17,17,17,0.45);
  --red:var(--accent);
  --red-deep:var(--chart-3);
  --gold:var(--chart-2);
  --coral:var(--chart-1);
  --plum:var(--chart-4);
  --line:var(--border);
  --muted:var(--text-2);
  --chrome-text: linear-gradient(135deg, #555 0%, #c0c0c0 45%, #e0e0e0 50%, #c0c0c0 55%, #555 100%);
  --display: 'Bebas Neue', 'Arial Narrow', Arial, sans-serif;
  --body: 'DM Sans', system-ui, Arial, sans-serif;
  --mono: 'Space Mono', 'Courier New', monospace;

  background:var(--paper);color:var(--ink);font-family:var(--body);
}
.planner-doc *{box-sizing:border-box;}
.planner-doc ::selection{background:var(--red);color:var(--paper);}
.planner-doc{scroll-behavior:smooth;}

/* The app's own AppNav is sticky at top:0 and is ~56px tall. This
   document's section nav sticks directly underneath it, so anchor
   jumps have to clear both. */
.planner-doc{--app-nav-h:56px;--doc-nav-h:46px;}
.planner-doc section[id]{scroll-margin-top:calc(var(--app-nav-h) + var(--doc-nav-h) + 8px);}

/* ---------- PAGE NAV ---------- */
.planner-doc .page-nav{
  /* Was top:0 with z-index:80 — i.e. the same position as AppNav but
     stacked above it, so scrolling the client portal slid this bar
     over the app's own navigation and hid it. It belongs below the
     app nav, both in position and in stacking order (AppNav is 40). */
  position:sticky;top:var(--app-nav-h);z-index:30;
  background:var(--paper);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border-bottom:1px solid var(--line);
}
.planner-doc .page-nav-inner{
  max-width:1040px;margin:0 auto;padding:0 20px;
  display:flex;align-items:center;gap:2px;
  overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;
}
.planner-doc .page-nav-inner::-webkit-scrollbar{display:none;}
.planner-doc .page-nav-top{
  font-family:var(--display);font-weight:400;font-size:13px;letter-spacing:.02em;
  color:var(--red);text-decoration:none;white-space:nowrap;
  padding:13px 14px 13px 0;margin-right:6px;border-right:1px solid var(--line);
  flex-shrink:0;
}
.planner-doc .page-nav a.page-nav-link{
  font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;
  color:var(--muted);text-decoration:none;white-space:nowrap;flex-shrink:0;
  padding:14px 11px;border-bottom:2px solid transparent;
  transition:color .15s, border-color .15s;
}
.planner-doc .page-nav a.page-nav-link:hover{color:var(--ink);}
.planner-doc .page-nav a.page-nav-link.active{color:var(--red);border-bottom-color:var(--red);}

/* ---------- HERO / SLATE ---------- */
/* Decluttered: the diagonal "film slate" stripe bar and the vertical
   scanline overlay on the hero were pure decoration stacked on top of
   an already-dense document. Both are gone, and the hero is shorter.
   .slate-stripes keeps its element because it doubles as the "back to
   top" anchor target, so it becomes zero-height rather than
   display:none — a display:none element can't be scrolled to. */
.planner-doc .slate-stripes{height:0;width:100%;background:none;}
.planner-doc .hero{
  background:var(--hero-bg);color:var(--hero-fg);
  padding:52px 24px 44px;
  position:relative;
  overflow:hidden;
}
.planner-doc .hero-inner{max-width:920px;margin:0 auto;position:relative;}
.planner-doc .eyebrow-row{
  display:flex;flex-wrap:wrap;gap:10px 22px;
  font-family:var(--mono);font-size:11px;letter-spacing:.06em;
  color:var(--panel-accent);margin-bottom:22px;text-transform:uppercase;
}
.planner-doc .eyebrow-row span b{color:var(--hero-fg);font-weight:700;}
.planner-doc h1.brand{
  font-family:var(--display);font-weight:400;
  /* Was clamp(48px,10vw,96px) — 96px of display type above the fold
     left no room for anything else on a laptop. */
  font-size:clamp(38px,7vw,64px);line-height:.95;
  letter-spacing:.01em;margin:0 0 10px;color:var(--hero-fg);
}
.planner-doc h1.brand em{font-style:normal;color:var(--panel-accent);}
.planner-doc .hero-sub{
  font-family:var(--mono);font-size:13px;letter-spacing:.08em;text-transform:uppercase;
  color:var(--panel-fg-dim);margin:0;
}

/* The washes are the only tokens above that need a per-theme value:
   everything else resolves through the app's own variables, which
   already switch. Written in the three-state form the rest of this
   codebase uses — system preference, then an explicit choice either
   way — so the toggle wins in both directions. */
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) .planner-doc{
    --wash-1:rgba(245,245,243,0.05);
    --wash-2:rgba(245,245,243,0.09);
    --wash-edge:rgba(245,245,243,0.40);
  }
}
:root[data-theme="dark"] .planner-doc{
  --wash-1:rgba(245,245,243,0.05);
  --wash-2:rgba(245,245,243,0.09);
  --wash-edge:rgba(245,245,243,0.40);
}

/* ---------- THESIS ---------- */
.planner-doc .thesis{
  max-width:760px;margin:0 auto;padding:56px 24px 44px;text-align:center;
}
.planner-doc .thesis p{
  font-size:clamp(19px,2.8vw,24px);line-height:1.45;margin:0;
  font-weight:400;color:var(--ink);
}
.planner-doc .thesis .lead-mark{color:var(--red);font-family:var(--display);font-size:1.1em;}
.planner-doc .thesis small{
  display:block;margin-top:18px;font-family:var(--mono);font-size:12px;
  color:var(--muted);letter-spacing:.04em;
}

.planner-doc section{max-width:1040px;margin:0 auto;padding:52px 24px;}
.planner-doc .section-head{margin-bottom:28px;}
.planner-doc .section-head .tag{
  font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--red);display:block;margin-bottom:6px;
}
.planner-doc .section-head h2{
  font-family:var(--display);font-weight:400;font-size:clamp(28px,4vw,40px);
  margin:0;letter-spacing:.01em;
}
.planner-doc .section-head p.desc{font-size:15px;color:var(--muted);max-width:620px;margin:10px 0 0;line-height:1.55;}

/* ---------- PILLARS ---------- */
.planner-doc .pillars{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;}
@media (max-width:680px){.planner-doc .pillars{grid-template-columns:1fr;}}
.planner-doc .pillar-card{
  background:var(--card);border:1px solid var(--line);border-radius:10px;padding:26px 24px 24px;box-shadow:var(--shadow-sm);
  position:relative;
}
.planner-doc .pillar-remove{
  position:absolute;top:10px;right:10px;
  width:22px;height:22px;border-radius:50%;
  border:1px solid var(--line);background:var(--card);color:var(--muted);
  font-family:var(--mono);font-size:13px;line-height:1;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  opacity:0;transition:opacity .15s, border-color .15s, color .15s;
}
.planner-doc .pillar-card:hover .pillar-remove{opacity:1;}
.planner-doc .pillar-remove:hover{border-color:var(--red);color:var(--red);}
.planner-doc .add-pillar-btn, .planner-doc .add-link-btn, .planner-doc .add-brand-btn, .planner-doc .add-timeline-btn{
  margin-top:16px;width:100%;
  border:1.5px dashed var(--line);border-radius:10px;background:transparent;
  padding:16px;cursor:pointer;
  font-family:var(--mono);font-size:12px;letter-spacing:.05em;text-transform:uppercase;
  color:var(--muted);transition:border-color .15s, color .15s, background-color .15s;
}
.planner-doc .add-pillar-btn:hover, .planner-doc .add-link-btn:hover, .planner-doc .add-brand-btn:hover, .planner-doc .add-timeline-btn:hover{
  border-color:var(--red);color:var(--red);background:var(--wash-1);
}
.planner-doc .pillar-card .top-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;}
.planner-doc .pillar-card h3{font-family:var(--display);font-weight:400;font-size:22px;margin:0;letter-spacing:.01em;}
.planner-doc .pillar-card .pct{font-family:var(--mono);font-size:26px;font-weight:700;}
.planner-doc .pillar-card .role{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:14px;display:block;}
.planner-doc .bar-track{height:6px;background:var(--paper-dim);border-radius:3px;overflow:hidden;margin-bottom:14px;}
.planner-doc .bar-fill{height:100%;border-radius:3px;}
.planner-doc .pillar-card p{font-size:14px;line-height:1.55;color:var(--body-text);margin:0 0 14px;}
.planner-doc .chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
.planner-doc .chip{
  display:inline-flex;align-items:center;gap:6px;
  font-family:var(--mono);font-size:11px;padding:4px 6px 4px 9px;border:1px solid var(--line);
  border-radius:20px;color:var(--muted);
}
.planner-doc .chip-text{cursor:text;border-radius:10px;outline:1px dashed transparent;outline-offset:2px;}
.planner-doc .chip-text:hover{outline-color:var(--wash-edge);}
.planner-doc .chip-text:focus{outline:1px solid var(--red);background-color:var(--wash-2);}
.planner-doc .chip-remove{
  width:15px;height:15px;border-radius:50%;border:none;background:var(--paper-dim);
  color:var(--muted);font-family:var(--mono);font-size:10px;line-height:1;
  display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;
  opacity:0;transition:opacity .15s;
}
.planner-doc .chip:hover .chip-remove{opacity:1;}
.planner-doc .chip-remove:hover{background:var(--red);color:var(--accent-fg);}
.planner-doc .chip-add{
  font-family:var(--mono);font-size:11px;padding:4px 10px;border:1px dashed var(--line);
  border-radius:20px;background:transparent;color:var(--muted);cursor:pointer;
  transition:border-color .15s, color .15s, background-color .15s;
}
.planner-doc .chip-add:hover{border-color:var(--red);color:var(--red);background:var(--wash-1);}

/* ---------- FORMAT ROW ---------- */
.planner-doc .format-row{display:flex;gap:14px;flex-wrap:wrap;}
.planner-doc .format-stat{
  flex:1;min-width:140px;background:var(--panel-bg);color:var(--panel-fg);
  padding:20px 18px;border-radius:10px;
}
.planner-doc .format-stat .num{font-family:var(--display);font-size:34px;color:var(--panel-accent);display:block;}
.planner-doc .format-stat .lbl{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--panel-fg-dim);}

/* ---------- ACTS / TABS ---------- */
.planner-doc .tabs{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;}
.planner-doc .tab-btn{
  font-family:var(--mono);font-size:12px;letter-spacing:.05em;text-transform:uppercase;
  background:transparent;border:1px solid var(--ink);color:var(--ink);
  padding:10px 16px;border-radius:20px;cursor:pointer;transition:.15s;
}
.planner-doc .tab-btn.active{background:var(--ink);color:var(--paper);}
.planner-doc .act-panel{display:none;}
.planner-doc .act-panel.active{display:block;}
.planner-doc .week-row{
  display:grid;grid-template-columns:110px 1fr;gap:18px;
  padding:18px 0;border-top:1px solid var(--line);
}
.planner-doc .week-row:last-child{border-bottom:1px solid var(--line);}
.planner-doc .week-tc{font-family:var(--mono);font-size:13px;color:var(--red);padding-top:2px;}
.planner-doc .week-tc small{display:block;color:var(--muted);font-size:10px;margin-top:3px;}
.planner-doc .week-body h4{margin:0 0 6px;font-size:16px;font-family:var(--body);font-weight:700;}
.planner-doc .week-body p{margin:0;font-size:14px;line-height:1.55;color:var(--body-text);}

/* ---------- WORKFLOW ---------- */
.planner-doc .workflow{display:flex;gap:0;flex-wrap:wrap;counter-reset:step;}
.planner-doc .wf-step{flex:1;min-width:150px;position:relative;padding:0 16px 0 0;}
.planner-doc .wf-step .wf-num{font-family:var(--mono);color:var(--red);font-size:12px;display:block;margin-bottom:8px;}
.planner-doc .wf-step h4{font-size:14px;margin:0 0 6px;}
.planner-doc .wf-step p{font-size:13px;color:var(--muted);margin:0;line-height:1.5;}

/* ---------- METRICS ---------- */
.planner-doc .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
@media (max-width:680px){.planner-doc .metrics{grid-template-columns:repeat(2,1fr);}}
.planner-doc .metric-card{border:1px solid var(--line);background:var(--card);padding:22px;border-radius:10px;box-shadow:var(--shadow-sm);}
.planner-doc .metric-card .m-lbl{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.planner-doc .metric-card .m-val{font-family:var(--display);font-size:24px;margin-top:6px;display:block;}

.planner-doc footer{
  text-align:center;padding:36px 24px 48px;font-family:var(--mono);font-size:11px;
  color:var(--muted);letter-spacing:.04em;
}

/* ---------- EDITABLE STATE ---------- */
.planner-doc [contenteditable="true"]{
  border-radius:10px;
  outline:1px dashed transparent;
  outline-offset:3px;
  transition:outline-color .12s, background-color .12s;
  cursor:text;
}
.planner-doc [contenteditable="true"]:hover{
  outline-color:var(--wash-edge);
  background-color:var(--wash-1);
}
.planner-doc [contenteditable="true"]:focus{
  outline:2px solid var(--red);
  background-color:var(--wash-2);
}

.planner-doc .toolbar{
  position:fixed;bottom:20px;right:20px;z-index:999;
  display:flex;gap:8px;align-items:center;
  background:var(--hero-bg);padding:10px 12px;border-radius:30px;
  box-shadow:0 6px 20px rgba(0,0,0,.25);
}
.planner-doc .toolbar button{
  font-family:var(--mono);font-size:11px;letter-spacing:.04em;text-transform:uppercase;
  background:var(--red);color:var(--hero-fg);border:none;
  padding:9px 16px;border-radius:20px;cursor:pointer;
}
.planner-doc .toolbar button.secondary{background:transparent;color:var(--panel-fg);border:1px solid var(--panel-line);}
.planner-doc .toolbar .status{font-family:var(--mono);font-size:10px;color:var(--panel-fg-dim);padding-left:4px;white-space:nowrap;}
@media (max-width:520px){
  .planner-doc .toolbar{left:12px;right:12px;bottom:12px;flex-wrap:wrap;justify-content:center;}
}

/* ---------- LOGO SLOT ---------- */
.planner-doc .logo-slot-wrap{
  max-width:760px;margin:40px auto 0;padding:0 24px;
  display:flex;justify-content:center;
}
.planner-doc .logo-slot{
  width:220px;height:120px;
  border:1.5px dashed var(--line);border-radius:10px;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;background:var(--card);position:relative;overflow:hidden;
  transition:border-color .15s, background-color .15s;
}
.planner-doc .logo-slot:hover{border-color:var(--red);background-color:var(--wash-1);}
.planner-doc .logo-slot .logo-placeholder{
  text-align:center;font-family:var(--mono);font-size:11px;color:var(--muted);
  text-transform:uppercase;letter-spacing:.05em;line-height:1.6;padding:0 12px;
}
.planner-doc .logo-slot img{max-width:100%;max-height:100%;object-fit:contain;display:block;}
.planner-doc .logo-remove{
  font-family:var(--mono);font-size:10px;color:var(--muted);
  text-align:center;margin-top:8px;cursor:pointer;text-decoration:underline;
}

/* ---------- LINK LIST ---------- */
.planner-doc .link-list{border-top:1px solid var(--line);}
.planner-doc .link-row{
  display:grid;grid-template-columns:28px 240px 1fr 28px 30px;gap:16px;align-items:center;
  padding:14px 0;border-bottom:1px solid var(--line);background:var(--card);
}
@media (max-width:760px){
  .planner-doc .link-row{grid-template-columns:24px 1fr 28px 30px;grid-template-areas:"idx title open remove" "empty link link link";row-gap:8px;padding:16px 0;}
  .planner-doc .link-idx{grid-area:idx;} .planner-doc .link-title{grid-area:title;} .planner-doc .link-remove{grid-area:remove;}
  .planner-doc .link-input{grid-area:link;} .planner-doc .link-open{grid-area:open;}
}
.planner-doc .link-idx{font-family:var(--mono);font-size:11px;color:var(--red);}
.planner-doc .link-title{font-family:var(--body);font-weight:700;font-size:14px;line-height:1.4;}
.planner-doc .link-input{
  font-family:var(--mono);font-size:12px;padding:9px 10px;width:100%;
  border:1px solid var(--line);border-radius:10px;background:var(--paper-dim);color:var(--ink);
}
.planner-doc .link-input::placeholder{color:var(--text-2);}
.planner-doc .link-input:focus{outline:none;border-color:var(--red);background:var(--card);}
.planner-doc .link-open{
  width:22px;height:22px;border-radius:50%;border:1px solid var(--line);background:var(--card);
  color:var(--muted);font-family:var(--mono);font-size:12px;line-height:1;text-decoration:none;
  display:none;align-items:center;justify-content:center;flex-shrink:0;
  transition:border-color .15s, color .15s, background-color .15s;
}
.planner-doc .link-row.has-link .link-open{display:flex;}
.planner-doc .link-open:hover{border-color:var(--red);color:var(--red);background:var(--wash-2);}
.planner-doc .link-remove{
  width:22px;height:22px;border-radius:50%;border:1px solid var(--line);background:var(--card);
  color:var(--muted);font-family:var(--mono);font-size:12px;line-height:1;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  opacity:0;transition:opacity .15s, border-color .15s, color .15s;
}
.planner-doc .link-row:hover .link-remove{opacity:1;}
.planner-doc .link-remove:hover{border-color:var(--red);color:var(--red);}

/* ---------- BRANDING & POSITIONING ---------- */
.planner-doc .brand-table{border-top:1px solid var(--line);}
.planner-doc .brand-row{
  display:grid;grid-template-columns:210px 1fr 30px;gap:20px;align-items:start;
  padding:16px 0;border-bottom:1px solid var(--line);position:relative;
}
.planner-doc .brand-row:nth-child(even){background:var(--paper-dim);}
@media (max-width:680px){
  .planner-doc .brand-row{grid-template-columns:1fr 30px;grid-template-areas:"label remove" "value value";row-gap:8px;padding:16px 10px;}
  .planner-doc .brand-label{grid-area:label;} .planner-doc .brand-value{grid-area:value;} .planner-doc .brand-remove{grid-area:remove;}
}
.planner-doc .brand-row:nth-child(even) .brand-label,
.planner-doc .brand-row:nth-child(even) .brand-value{padding-left:10px;}
.planner-doc .brand-label{
  font-family:var(--mono);font-weight:700;font-size:12px;text-transform:uppercase;
  letter-spacing:.04em;color:var(--ink);padding-top:2px;line-height:1.4;
}
.planner-doc .brand-value{font-size:14.5px;line-height:1.55;color:var(--body-text);}
.planner-doc .brand-remove{
  width:22px;height:22px;border-radius:50%;border:1px solid var(--line);background:var(--card);
  color:var(--muted);font-family:var(--mono);font-size:12px;line-height:1;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  opacity:0;transition:opacity .15s, border-color .15s, color .15s;
}
.planner-doc .brand-row:hover .brand-remove{opacity:1;}
.planner-doc .brand-remove:hover{border-color:var(--red);color:var(--red);}

/* ---------- MONTHLY SLOT PLANNER ---------- */
.planner-doc .slot-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:22px;}
.planner-doc .slot-count-label{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.planner-doc .slot-count-input{
  width:64px;font-family:var(--mono);font-size:14px;padding:9px 8px;text-align:center;
  border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);
}
.planner-doc .slot-count-input:focus{outline:none;border-color:var(--red);}
.planner-doc .slot-generate-btn{
  font-family:var(--mono);font-size:11px;letter-spacing:.04em;text-transform:uppercase;
  padding:11px 20px;border:1px solid var(--ink);background:var(--ink);color:var(--paper);
  border-radius:20px;cursor:pointer;transition:.15s;
}
.planner-doc .slot-generate-btn:hover{background:var(--red);border-color:var(--red);}
/* Two across, not four. Each slot now carries a full brief — hook,
   body, CTA, WMS, scenery, set — and a quarter-width column turns
   every one of those lines into two or three wrapped words. */
.planner-doc .slot-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}
@media (max-width:820px){.planner-doc .slot-grid{grid-template-columns:1fr;}}

/* Videos are shot in batches, so the plan reads in batches. The
   heading is the same name the calendar entry uses — "Video Set 1 —
   shoot day" — so the two line up without anyone cross-referencing. */
.planner-doc .slot-set{margin-bottom:26px;}
.planner-doc .slot-set-head{
  display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;
  padding-bottom:8px;margin-bottom:14px;border-bottom:1px solid var(--line);
}
.planner-doc .slot-set-name{
  font-family:var(--display);font-weight:400;font-size:19px;letter-spacing:.01em;color:var(--ink);
}
.planner-doc .slot-set-count{
  font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
}
.planner-doc .slot-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px;box-shadow:var(--shadow-sm);}
.planner-doc .slot-num{font-family:var(--mono);font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:8px;}
.planner-doc .slot-title{font-family:var(--display);font-weight:400;font-size:17px;letter-spacing:.01em;line-height:1.15;margin-bottom:6px;}
.planner-doc .slot-desc{font-family:var(--body);font-size:12.5px;line-height:1.5;color:var(--body-text);margin-bottom:12px;}
/* The preset brief. Labels stay put whether or not the line is
   filled in — that is what makes it a template rather than a blank
   card, and an unanswered question should look unanswered. */
.planner-doc .slot-brief{
  display:flex;flex-direction:column;gap:9px;
  padding:12px 0;margin-bottom:12px;
  border-top:1px solid var(--line);border-bottom:1px solid var(--line);
}
.planner-doc .slot-brief-pair{display:grid;grid-template-columns:1fr 1fr;gap:9px;}
@media (max-width:460px){.planner-doc .slot-brief-pair{grid-template-columns:1fr;}}
.planner-doc .slot-field{display:flex;flex-direction:column;gap:3px;min-width:0;}
.planner-doc .slot-field-label{
  font-family:var(--mono);font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;
  color:var(--muted);
}
.planner-doc .slot-field-value{
  font-family:var(--body);font-size:13px;line-height:1.5;color:var(--body-text);
  border-radius:6px;padding:3px 5px;margin:-3px -5px;
  white-space:pre-wrap;word-break:break-word;
}
.planner-doc .slot-field-tall .slot-field-value{min-height:2.6em;}
/* An empty field shows the question's prompt, or an em dash when
   there is nothing to prompt with. content: on ::before rather than a
   real placeholder attribute, because these are contenteditable divs
   rather than inputs. */
.planner-doc .slot-field-value.is-empty{color:var(--text-3);}
.planner-doc [contenteditable].slot-field-value.is-empty::before{
  content:var(--placeholder, "—");color:var(--text-3);
}
.planner-doc [contenteditable].slot-field-value:focus::before{content:none;}
.planner-doc [contenteditable].slot-field-value:hover{background:var(--wash-1);}
.planner-doc [contenteditable].slot-field-value:focus{
  outline:1px solid var(--red);background:var(--wash-2);
}

.planner-doc .slot-pillar-select{
  width:100%;font-family:var(--display);font-weight:400;font-size:15px;letter-spacing:.01em;
  padding:8px 8px;margin-bottom:10px;border:1px solid var(--line);border-radius:10px;
  background:var(--paper-dim);color:var(--ink);cursor:pointer;
}
.planner-doc .slot-pillar-select:focus{outline:none;border-color:var(--red);}
.planner-doc .slot-link-wrap{position:relative;}
.planner-doc .slot-link-input{
  width:100%;font-family:var(--mono);font-size:11px;padding:8px 30px 8px 9px;
  border:1px solid var(--line);border-radius:10px;background:var(--paper-dim);color:var(--ink);
}
.planner-doc .slot-link-input::placeholder{color:var(--text-2);}
.planner-doc .slot-link-input:focus{outline:none;border-color:var(--red);background:var(--card);}
.planner-doc .slot-link-open{
  position:absolute;top:50%;right:5px;transform:translateY(-50%);
  width:20px;height:20px;border-radius:50%;border:1px solid var(--line);background:var(--card);
  color:var(--muted);font-family:var(--mono);font-size:11px;line-height:1;text-decoration:none;
  display:none;align-items:center;justify-content:center;
  transition:border-color .15s, color .15s, background-color .15s;
}
.planner-doc .slot-link-wrap.has-link .slot-link-open{display:flex;}
.planner-doc .slot-link-open:hover{border-color:var(--red);color:var(--red);background:var(--wash-2);}

/* ---------- CLIENT TIMELINE ---------- */
.planner-doc .timeline-status{display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:720px;margin-bottom:16px;}
.planner-doc .timeline-status-badge{
  font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;
  border:1px solid var(--red);color:var(--red);border-radius:20px;padding:4px 12px;
  white-space:nowrap;transition:.2s;
}
.planner-doc .timeline-status-badge.state-not-started{border-color:var(--line);color:var(--muted);}
.planner-doc .timeline-status-badge.state-complete{border-color:var(--ink);color:var(--ink);}
.planner-doc .timeline-status-text{font-size:14px;color:var(--body-text);}
.planner-doc .timeline-progress{display:flex;align-items:center;gap:14px;max-width:720px;margin-bottom:30px;}
.planner-doc .timeline-progress-track{flex:1;height:6px;background:var(--paper-dim);border-radius:3px;overflow:hidden;}
.planner-doc .timeline-progress-fill{height:100%;background:var(--red);border-radius:3px;transition:width .35s ease;}
.planner-doc .timeline-progress-label{font-family:var(--mono);font-size:11px;color:var(--muted);white-space:nowrap;}
.planner-doc .timeline{position:relative;padding-left:4px;max-width:720px;}
.planner-doc .timeline-item{position:relative;padding-left:44px;padding-bottom:34px;}
.planner-doc .timeline-item:last-child{padding-bottom:0;}
.planner-doc .timeline-item::before{
  content:"";position:absolute;left:11px;top:26px;bottom:-10px;width:2px;
  background:var(--line);transition:background-color .25s;
}
.planner-doc .timeline-item.done::before{background:var(--red);}
.planner-doc .timeline-item:last-child::before{display:none;}
.planner-doc .timeline-dot{
  position:absolute;left:0;top:2px;width:24px;height:24px;border-radius:50%;
  background:var(--paper);border:2px solid var(--red);display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:transform .15s, background-color .2s;
}
.planner-doc .timeline-dot:hover{transform:scale(1.18);}
.planner-doc .timeline-dot::after{content:"";width:8px;height:8px;border-radius:50%;background:var(--red);transition:all .18s;}
.planner-doc .timeline-item:nth-child(3n+2) .timeline-dot{border-color:var(--gold);}
.planner-doc .timeline-item:nth-child(3n+2) .timeline-dot::after{background:var(--gold);}
.planner-doc .timeline-item:nth-child(3n) .timeline-dot{border-color:var(--ink);}
.planner-doc .timeline-item:nth-child(3n) .timeline-dot::after{background:var(--ink);}
.planner-doc .timeline-item.done .timeline-dot{background:var(--red);border-color:var(--red);}
.planner-doc .timeline-item:nth-child(3n+2).done .timeline-dot{background:var(--gold);border-color:var(--gold);}
.planner-doc .timeline-item:nth-child(3n).done .timeline-dot{background:var(--ink);border-color:var(--ink);}
.planner-doc .timeline-item.done .timeline-dot::after{
  content:"✓";width:auto;height:auto;background:transparent;
  color:var(--paper);font-family:var(--mono);font-weight:700;font-size:12px;
}
.planner-doc .timeline-card{
  position:relative;padding:8px 28px 8px 14px;margin-left:-14px;border-radius:3px;
  transition:background-color .15s, opacity .2s;
}
.planner-doc .timeline-item:hover .timeline-card{background:var(--wash-1);}
.planner-doc .timeline-item.done .timeline-card{opacity:.62;}
.planner-doc .timeline-remove{
  position:absolute;top:8px;right:6px;width:22px;height:22px;border-radius:50%;
  border:1px solid var(--line);background:var(--card);color:var(--muted);
  font-family:var(--mono);font-size:12px;line-height:1;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  opacity:0;transition:opacity .15s, border-color .15s, color .15s;
}
.planner-doc .timeline-item:hover .timeline-remove{opacity:1;}
.planner-doc .timeline-remove:hover{border-color:var(--red);color:var(--red);}
.planner-doc .timeline-date-row{display:flex;align-items:center;gap:8px;margin-bottom:5px;}
.planner-doc .timeline-date{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--red);}
.planner-doc .timeline-done-tag{
  display:none;font-family:var(--mono);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;
  color:var(--red);border:1px solid var(--red);border-radius:10px;padding:1px 7px;
}
.planner-doc .timeline-item.done .timeline-done-tag{display:inline-block;}
.planner-doc .timeline-title{font-family:var(--display);font-weight:400;font-size:19px;margin:0 0 6px;letter-spacing:.01em;}
.planner-doc .timeline-desc{font-size:14px;line-height:1.55;color:var(--body-text);margin:0;max-width:600px;}

/* ---------- GUARANTEE ---------- */
.planner-doc .guarantee-section{
  max-width:none;margin:0;padding:0 0 90px;
  background:var(--panel-bg);color:var(--panel-fg);
  position:relative;overflow:hidden;
}
.planner-doc .guarantee-section::after{
  content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(90deg, rgba(245,245,243,0.03) 0 2px, transparent 2px 40px);
  pointer-events:none;
}
.planner-doc .guarantee-inner{max-width:760px;margin:0 auto;position:relative;padding:72px 24px 0;}
.planner-doc .guarantee-mark{position:absolute;top:32px;right:28px;z-index:2;line-height:0;}
@media (max-width:680px){
  .planner-doc .guarantee-mark{top:20px;right:18px;}
  .planner-doc .guarantee-mark svg{width:46px;height:46px;}
}
.planner-doc .guarantee-tag{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--panel-accent);display:block;margin-bottom:16px;}
.planner-doc .guarantee-h2{font-family:var(--display);font-weight:400;font-size:clamp(32px,5vw,48px);margin:0 0 20px;color:var(--panel-fg);letter-spacing:.01em;line-height:1.05;}
.planner-doc .guarantee-body{font-size:clamp(15.5px,1.8vw,17px);line-height:1.65;color:var(--panel-fg-dim);margin:0 0 40px;max-width:600px;}
.planner-doc .guarantee-terms{border-top:1px solid var(--panel-line);}
.planner-doc .guarantee-term{
  display:grid;grid-template-columns:40px 1fr 28px;gap:14px;align-items:start;
  padding:18px 0;border-bottom:1px solid var(--panel-line);position:relative;
}
.planner-doc .term-num{font-family:var(--mono);font-size:12px;color:var(--panel-accent);padding-top:2px;}
.planner-doc .term-text{font-size:14.5px;line-height:1.55;color:var(--panel-fg);}
.planner-doc .gp-remove{
  width:20px;height:20px;border-radius:50%;border:1px solid var(--panel-line);background:transparent;
  color:var(--panel-fg-dim);font-family:var(--mono);font-size:11px;line-height:1;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  opacity:0;transition:opacity .15s;flex-shrink:0;margin-top:1px;
}
.planner-doc .guarantee-term:hover .gp-remove{opacity:1;}
.planner-doc .gp-remove:hover{border-color:var(--panel-accent);color:var(--panel-accent);}
.planner-doc .gp-add{
  margin-top:22px;font-family:var(--mono);font-size:11px;text-transform:uppercase;
  letter-spacing:.05em;color:var(--panel-fg-dim);background:transparent;border:1.5px dashed var(--panel-line);
  border-radius:20px;padding:10px 20px;cursor:pointer;transition:.15s;
}
.planner-doc .gp-add:hover{border-color:var(--panel-accent);color:var(--panel-accent);}
`;
