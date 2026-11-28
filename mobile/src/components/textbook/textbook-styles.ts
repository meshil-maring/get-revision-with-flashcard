// The textbook reader's stylesheet. Everything is under .tb, so on the web (where the reader is
// part of the app's page) it can't change anything else. Colours come from the theme tokens as
// CSS variables (textbook-theme.ts); sizes follow the type scale in the comments below.
import { COLUMN_WIDTHS, FONTS } from '@/components/textbook/textbook-theme';

// Type scale at Medium (--tb-scale 1). Phone / wider than 768px:
//   chapter title 30 / 38   section 23 / 27   subsection 19 / 21   body 17 / 18   captions 13 / 14
//   line height 1.7 for body text.
export const TEXTBOOK_CSS = `
.tb-shell{position:absolute;inset:0;overflow:hidden;background:var(--tb-page);color:var(--tb-text);
  -webkit-text-size-adjust:100%;text-size-adjust:100%;--tb-body:17px;--tb-measure:${COLUMN_WIDTHS.normal}px}
.tb-shell *,.tb-shell *::before,.tb-shell *::after{box-sizing:border-box}
.tb-scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;overscroll-behavior:contain}
@media (prefers-reduced-motion:reduce){.tb-scroll{scroll-behavior:auto}}
.tb-shell[data-width=narrow]{--tb-measure:${COLUMN_WIDTHS.narrow}px}
.tb-shell[data-width=wide]{--tb-measure:${COLUMN_WIDTHS.wide}px}
@media (min-width:768px){.tb-shell{--tb-body:18px}}

/* Toolbar: progress, contents, bookmark, reading controls. */
.tb-bar{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--tb-page) 92%,transparent);
  -webkit-backdrop-filter:saturate(1.4) blur(8px);backdrop-filter:saturate(1.4) blur(8px);border-bottom:1px solid var(--tb-border)}
.tb-bar-row{display:flex;align-items:center;gap:4px;height:48px;padding:0 8px;max-width:1280px;margin:0 auto;font-family:${FONTS.heading}}
.tb-bar-title{flex:1;min-width:0;font-size:14px;font-weight:600;color:var(--tb-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  opacity:0;transition:opacity .2s}
.tb-bar[data-scrolled=true] .tb-bar-title{opacity:1}
.tb-progress{height:2px;background:transparent}
.tb-progress-fill{height:100%;width:0;background:var(--tb-example);transform-origin:left;transition:width .1s linear}
.tb-icon-btn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;height:44px;
  padding:0 10px;border-radius:10px;color:var(--tb-heading);font:600 14px/1 ${FONTS.heading};cursor:pointer}
.tb-icon-btn:hover{background:var(--tb-surface)}
.tb-icon-btn:focus-visible,.tb-shell button:focus-visible,.tb-shell summary:focus-visible,.tb-shell a:focus-visible{outline:2px solid var(--tb-example);outline-offset:2px}
.tb-icon-btn[aria-pressed=true]{color:var(--tb-example)}
.tb-icon-btn svg{width:20px;height:20px;flex:none}

/* Focus mode: just the text (the app hides its own header). */
.tb-btn-label{font-size:13px}
@media (max-width:520px){.tb-btn-label{display:none}}
/* On every screen size: one centred column; contents (☰) and reading settings (Aa) from the toolbar. */
.tb-shell[data-focus=true] .tb-side{display:none !important}
.tb-shell[data-focus=true] .tb-layout{display:block;padding-left:20px;padding-right:20px}
.tb-shell[data-focus=true] .tb-main{max-width:var(--tb-measure);margin:0 auto}
.tb-shell[data-focus=true] .tb-icon-btn.tb-only-narrow{display:inline-flex !important}
.tb-shell[data-focus=true] .tb-panel{display:block !important}
.tb-shell[data-focus=true] .tb-bar-title{opacity:1}

/* Page layout: one column on phones; contents | text | tools on wide screens. */
.tb-layout{display:block;padding:0 20px 56px}
.tb-main{max-width:var(--tb-measure);margin:0 auto;min-width:0}
.tb-side{display:none}
@media (min-width:1100px){
  .tb-layout{display:grid;grid-template-columns:232px minmax(0,var(--tb-measure)) 232px;justify-content:center;gap:56px;padding:0 32px 72px}
  .tb-main{max-width:none;margin:0}
  .tb-side{display:block;position:sticky;top:72px;align-self:start;max-height:calc(100vh - 96px);overflow-y:auto;padding-top:40px}
  .tb-only-narrow{display:none !important}
}
@media (max-width:1099px){.tb-only-wide{display:none !important}}

/* Body text. */
.tb-article{font-family:${FONTS.body};font-size:calc(var(--tb-body) * var(--tb-scale,1));line-height:1.7;
  font-optical-sizing:auto;font-kerning:normal;font-variant-ligatures:common-ligatures;hyphens:auto;-webkit-hyphens:auto;
  overflow-wrap:break-word;text-rendering:optimizeLegibility}
.tb-article p{margin:0 0 1em}
.tb-article p.tb-lead{font-size:1.12em;line-height:1.6;color:var(--tb-secondary)}
.tb-article strong{font-weight:650}
.tb-article mark{background:var(--tb-mark);color:inherit;padding:0 .12em;border-radius:2px}
.tb-article a{color:var(--tb-link)}
.tb-article ul,.tb-article ol{margin:0 0 1em;padding-left:1.6em}
/* Set explicitly: the web app's base styles (Tailwind) take list markers away. */
.tb-article ul{list-style:disc outside}
.tb-article ul ul{list-style-type:circle}
.tb-article ol{list-style:decimal outside}
.tb-article li{margin:.25em 0;padding-left:.2em}
.tb-article li::marker{color:var(--tb-secondary)}
.tb-article ol>li::marker{font-family:${FONTS.heading};font-size:.85em;font-weight:600}

/* Chapter heading. */
.tb-chapter{padding:40px 0 28px;margin-bottom:28px;border-bottom:1px solid var(--tb-border)}
.tb-eyebrow{font:600 12px/1.4 ${FONTS.heading};letter-spacing:.14em;text-transform:uppercase;color:var(--tb-example);margin:0 0 14px}
.tb-chapter-num{display:block;font:600 15px/1.2 ${FONTS.heading};letter-spacing:.06em;text-transform:uppercase;color:var(--tb-secondary);margin-bottom:10px}
.tb-chapter-title{font:700 calc(30px * var(--tb-scale,1))/1.15 ${FONTS.heading};letter-spacing:-.02em;color:var(--tb-heading);margin:0;text-wrap:balance}
@media (min-width:768px){.tb-chapter{padding-top:56px}.tb-chapter-title{font-size:calc(38px * var(--tb-scale,1))}}
.tb-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:16px;font:500 13px/1.4 ${FONTS.heading};color:var(--tb-secondary)}
.tb-tag{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;border:1px solid var(--tb-border);font:600 12px/1.4 ${FONTS.heading};color:var(--tb-text)}
.tb-tag i{width:8px;height:8px;border-radius:50%;display:inline-block}

/* Section headings. */
.tb-h{font-family:${FONTS.heading};color:var(--tb-heading);scroll-margin-top:64px;text-wrap:balance;hyphens:manual;-webkit-hyphens:manual}
.tb-h .tb-num{color:var(--tb-example);font-weight:600;margin-right:.55em;font-variant-numeric:tabular-nums}
.tb-h1{font-size:calc(23px * var(--tb-scale,1));line-height:1.25;font-weight:700;letter-spacing:-.01em;margin:2.2em 0 .7em}
.tb-h2{font-size:calc(19px * var(--tb-scale,1));line-height:1.3;font-weight:650;margin:1.9em 0 .55em}
.tb-h3{font-size:calc(17px * var(--tb-scale,1));line-height:1.35;font-weight:650;margin:1.6em 0 .45em}
.tb-h4{font-size:1em;line-height:1.4;font-weight:650;margin:1.4em 0 .35em;color:var(--tb-text)}
@media (min-width:768px){.tb-h1{font-size:calc(27px * var(--tb-scale,1))}.tb-h2{font-size:calc(21px * var(--tb-scale,1))}.tb-h3{font-size:calc(18px * var(--tb-scale,1))}}
.tb-article>.tb-h:first-child{margin-top:.4em}
.tb-h-wrap{position:relative}
.tb-h-mark{position:absolute;left:-30px;top:.15em;color:var(--tb-example);width:18px;height:18px}
@media (max-width:767px){.tb-h-mark{left:auto;right:0}}

/* Maths. */
.tb-article .katex{font-size:1.08em;text-rendering:auto}
.tb-math-inline{white-space:nowrap}
.tb-eq{display:flex;align-items:center;gap:12px;margin:1.1em 0 1.3em;padding:.55em 0;background:var(--tb-formula);border-radius:6px}
.tb-eq-body{flex:1;min-width:0;overflow-x:auto;overflow-y:hidden;padding:.2em 16px;text-align:center;scrollbar-width:thin}
.tb-eq-body .katex-display{margin:0;overflow:visible}
.tb-eq-body .katex-display>.katex{text-align:center}
.tb-eq-num{flex:none;padding-right:14px;font:500 .9em/1 ${FONTS.body};color:var(--tb-secondary);font-variant-numeric:tabular-nums}
.tb-eq-error,.tb-math-error{font-family:${FONTS.code};font-size:.85em;color:var(--tb-error);background:var(--tb-error-fill);border-radius:4px}
.tb-math-error{padding:.05em .3em;white-space:pre-wrap}
.tb-eq-error{display:block;margin:1em 0;padding:10px 14px;border-left:3px solid var(--tb-error)}
.tb-eq-error b{display:block;font:600 12px/1.5 ${FONTS.heading};margin-bottom:4px}
.tb-eq-error pre{margin:0;white-space:pre-wrap;word-break:break-word;color:var(--tb-text)}

/* Academic blocks share a label line: "Definition 1.2 (Derivative)". */
.tb-label{font:700 .8em/1.4 ${FONTS.heading};letter-spacing:.02em;margin:0 0 .35em;display:flex;flex-wrap:wrap;align-items:baseline;gap:.15em .5em}
.tb-label .tb-label-title{font-weight:500;color:var(--tb-text)}
.tb-env{margin:1.6em 0;scroll-margin-top:64px}
.tb-env>.tb-env-body>:last-child,.tb-env-body>:last-child{margin-bottom:0}

.tb-definition{padding:.9em 1.1em;background:var(--tb-definition-fill);border-left:3px solid var(--tb-definition);border-radius:0 6px 6px 0}
.tb-definition>.tb-label{color:var(--tb-definition)}

.tb-theorem{padding:.9em 0 .9em 1.1em;border-left:3px double var(--tb-heading)}
.tb-theorem>.tb-label{color:var(--tb-heading)}
.tb-theorem>.tb-env-body{font-style:italic}
.tb-theorem>.tb-env-body .katex,.tb-theorem>.tb-env-body .tb-eq{font-style:normal}

.tb-remark>.tb-label{color:var(--tb-secondary)}
.tb-remark{padding-left:1.1em;border-left:1px solid var(--tb-border)}

.tb-proof{margin:-.6em 0 1.6em}
.tb-proof>.tb-label{font:italic 600 1em/1.7 ${FONTS.body};color:var(--tb-text);display:inline;margin-right:.4em;letter-spacing:0}
.tb-proof>.tb-env-body{display:inline}
.tb-proof>.tb-env-body>p:first-child{display:inline}
.tb-qed{float:right;margin-left:1em;color:var(--tb-secondary)}
.tb-proof::after{content:'';display:block;clear:both}

/* Worked examples: question, numbered steps, a boxed answer. */
.tb-example{border:1px solid var(--tb-border);border-top:3px solid var(--tb-example);border-radius:4px 4px 8px 8px;background:var(--tb-example-fill);padding:1em 1.15em 1.1em}
.tb-example>.tb-label{color:var(--tb-example)}
.tb-part{margin:.9em 0 0}
.tb-part:first-of-type{margin-top:.4em}
.tb-part-label{font:700 11px/1.5 ${FONTS.heading};letter-spacing:.12em;text-transform:uppercase;color:var(--tb-secondary);margin-bottom:.2em}
.tb-part>.tb-part-body>:last-child{margin-bottom:0}
.tb-article .tb-steps{list-style:none;margin:.8em 0 0;padding:0;counter-reset:none}
.tb-article .tb-step{position:relative;padding:0 0 .9em 2.4em;margin:0}
.tb-step::before{content:'';position:absolute;left:.8em;top:1.75em;bottom:.15em;width:1px;background:var(--tb-border)}
.tb-step:last-child::before{display:none}
.tb-step-num{position:absolute;left:0;top:.2em;width:1.6em;height:1.6em;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:var(--tb-page);border:1.5px solid var(--tb-example);color:var(--tb-example);font:700 .72em/1 ${FONTS.heading}}
.tb-step-title{font:600 .85em/1.5 ${FONTS.heading};color:var(--tb-heading);margin:.15em 0 .2em}
.tb-step .tb-eq{background:var(--tb-page)}
.tb-step-body>:last-child{margin-bottom:0}
.tb-answer{margin-top:1em;padding:.75em 1em;border:1.5px solid var(--tb-answer);border-radius:8px;background:var(--tb-answer-fill)}
.tb-answer .tb-part-label{color:var(--tb-answer)}
.tb-answer .tb-eq{background:transparent;margin:.4em 0}
.tb-question{padding-bottom:.6em;border-bottom:1px dashed var(--tb-border)}

/* Exercises. */
.tb-exercise{padding-top:.9em;border-top:2px solid var(--tb-heading)}
.tb-exercise>.tb-label{color:var(--tb-heading)}
.tb-article .tb-exercise>.tb-env-body>ol>li{padding-left:.4em;margin:.5em 0}
.tb-level{font:700 10.5px/1 ${FONTS.heading};letter-spacing:.1em;text-transform:uppercase;padding:4px 8px;border-radius:999px;border:1px solid currentColor;align-self:center}
.tb-level-easy{color:var(--tb-answer)}
.tb-level-medium{color:var(--tb-hint)}
.tb-level-hard{color:var(--tb-hard)}
.tb-fold{margin:.6em 0;border:1px solid var(--tb-border);border-radius:8px;background:var(--tb-page)}
.tb-fold>summary{cursor:pointer;list-style:none;padding:.55em .9em;font:600 13px/1.5 ${FONTS.heading};display:flex;align-items:center;gap:.5em;min-height:44px}
.tb-fold>summary::-webkit-details-marker{display:none}
.tb-fold>summary::before{content:'';width:.45em;height:.45em;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);transition:transform .15s;margin-right:.2em}
.tb-fold[open]>summary::before{transform:rotate(45deg)}
.tb-fold>.tb-env-body{padding:.2em 1em .9em}
.tb-fold-hint>summary{color:var(--tb-hint)}
.tb-fold-solution>summary,.tb-fold-answer>summary{color:var(--tb-answer)}

/* Summary and references close a chapter. */
.tb-summary{padding:1.1em 1.25em;background:var(--tb-surface);border-radius:8px}
.tb-summary>.tb-label{color:var(--tb-heading);font-size:.75em;letter-spacing:.14em;text-transform:uppercase}
.tb-references{font-size:.9em}
.tb-references>.tb-label{color:var(--tb-heading)}
.tb-article .tb-references ol,.tb-article .tb-references ul{padding-left:1.4em}

/* Boxes from standard notes (:::good, :::bad, :::note) in textbook form. */
.tb-box{margin:1.4em 0;padding:.85em 1.1em;border:1px solid var(--tb-border);border-radius:8px}
.tb-box-good{border-left:3px solid var(--tb-answer)}
.tb-box-bad{border-left:3px solid var(--tb-hard)}
.tb-box-note{border-left:3px solid var(--tb-example)}
.tb-box>.tb-label{color:var(--tb-heading)}

/* Tables: ruled like a printed book, sideways scrolling when wide. */
.tb-table-wrap{margin:1.3em 0 1.5em;overflow-x:auto;-webkit-overflow-scrolling:touch;border-top:1.5px solid var(--tb-heading);border-bottom:1.5px solid var(--tb-heading);scrollbar-width:thin}
.tb-table{border-collapse:collapse;width:100%;font-size:.9em;line-height:1.5;font-variant-numeric:tabular-nums lining-nums}
.tb-table th,.tb-table td{padding:.5em .8em;text-align:left;vertical-align:top;min-width:4.5em}
.tb-table th{font:600 .82em/1.5 ${FONTS.heading};color:var(--tb-heading);border-bottom:1px solid var(--tb-heading);white-space:nowrap}
.tb-table tbody tr+tr td{border-top:1px solid var(--tb-border)}

/* Code. */
.tb-code{margin:1.2em 0;border:1px solid var(--tb-border);border-radius:6px;background:var(--tb-surface);overflow:hidden}
.tb-code-lang{font:600 11px/1 ${FONTS.heading};letter-spacing:.08em;text-transform:uppercase;color:var(--tb-secondary);padding:8px 12px 0}
.tb-code pre{margin:0;padding:10px 12px 12px;overflow-x:auto;font:13.5px/1.55 ${FONTS.code};tab-size:2;hyphens:none;-webkit-hyphens:none;color:var(--tb-text)}
.tb-article code.tb-code-inline{font-family:${FONTS.code};font-size:.88em}

/* Figures (diagrams and images). */
.tb-figure{margin:1.6em 0;text-align:center}
.tb-figure-plate{display:block;width:100%;padding:12px;background:var(--tb-plate);border:1px solid var(--tb-border);border-radius:6px;cursor:zoom-in;border-style:solid}
.tb-figure img{display:block;max-width:100%;max-height:70vh;height:auto;margin:0 auto;object-fit:contain}
.tb-figure figcaption{margin-top:.6em;font:calc(13px * var(--tb-scale,1))/1.5 ${FONTS.heading};color:var(--tb-secondary);text-align:left}
@media (min-width:768px){.tb-figure figcaption{font-size:calc(14px * var(--tb-scale,1))}}
.tb-figure figcaption b{color:var(--tb-text);font-weight:650;margin-right:.4em}
.tb-figure-missing{padding:28px 16px;border:1px dashed var(--tb-border);border-radius:6px;color:var(--tb-secondary);font:13px/1.5 ${FONTS.heading}}
.tb-lightbox{position:absolute;inset:0;z-index:20;background:rgba(10,12,14,.88);display:flex;align-items:center;justify-content:center;padding:16px;cursor:zoom-out}
.tb-lightbox img{max-width:100%;max-height:100%;background:var(--tb-plate);border-radius:6px;padding:12px}

/* End of chapter: previous / next. */
.tb-pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:48px;padding-top:24px;border-top:1px solid var(--tb-border)}
.tb-pager button{all:unset;box-sizing:border-box;cursor:pointer;padding:14px 16px;border:1px solid var(--tb-border);border-radius:10px;min-height:44px;font-family:${FONTS.heading};min-width:0}
.tb-pager button:hover{border-color:var(--tb-example)}
.tb-pager button[disabled]{visibility:hidden}
.tb-pager small{display:block;font:600 11px/1.5 ${FONTS.heading};letter-spacing:.1em;text-transform:uppercase;color:var(--tb-secondary)}
.tb-pager span{display:block;font:600 15px/1.35 ${FONTS.heading};color:var(--tb-heading);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.tb-pager .tb-next{text-align:right}

/* Contents. */
.tb-toc{font-family:${FONTS.heading}}
.tb-toc h2{font:700 11px/1.5 ${FONTS.heading};letter-spacing:.14em;text-transform:uppercase;color:var(--tb-secondary);margin:0 0 10px}
.tb-toc ol{list-style:none;margin:0;padding:0}
.tb-toc li{display:flex;align-items:flex-start}
.tb-toc a{flex:1;display:flex;gap:10px;padding:7px 10px;border-radius:8px;text-decoration:none;color:var(--tb-text);font-size:14px;line-height:1.4;border-left:2px solid transparent;min-height:36px}
.tb-toc a:hover{background:var(--tb-surface)}
.tb-toc a[aria-current=true]{color:var(--tb-heading);font-weight:650;border-left-color:var(--tb-example);border-radius:0 8px 8px 0;background:var(--tb-surface)}
.tb-toc .tb-toc-num{color:var(--tb-secondary);font-variant-numeric:tabular-nums;min-width:2.2em}
.tb-toc li.tb-toc-sub a{padding-left:24px;font-size:13px}
.tb-toc-mark{all:unset;cursor:pointer;width:32px;height:36px;display:flex;align-items:center;justify-content:center;color:var(--tb-secondary);opacity:.55}
.tb-toc-mark[aria-pressed=true]{color:var(--tb-example);opacity:1}
.tb-toc-mark svg{width:15px;height:15px}
.tb-drawer-backdrop{position:absolute;inset:0;z-index:10;background:rgba(10,12,14,.38)}
.tb-drawer{position:absolute;top:0;bottom:0;left:0;z-index:11;width:min(86%,340px);background:var(--tb-page);border-right:1px solid var(--tb-border);
  box-shadow:4px 0 24px var(--tb-shadow);overflow-y:auto;padding:16px 12px 32px}
.tb-drawer-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}

/* Reading controls. */
.tb-controls{font-family:${FONTS.heading};display:grid;gap:18px}
.tb-panel{position:absolute;top:56px;right:8px;z-index:12;width:min(320px,calc(100% - 16px));padding:16px;background:var(--tb-page);border:1px solid var(--tb-border);
  border-radius:12px;box-shadow:0 12px 32px var(--tb-shadow)}
.tb-control-label{font:700 11px/1.5 ${FONTS.heading};letter-spacing:.12em;text-transform:uppercase;color:var(--tb-secondary);margin-bottom:8px}
.tb-segmented{display:flex;border:1px solid var(--tb-border);border-radius:10px;padding:3px;gap:3px}
.tb-segmented button{all:unset;cursor:pointer;flex:1;text-align:center;padding:8px 6px;border-radius:7px;font:600 13px/1.2 ${FONTS.heading};color:var(--tb-text);min-height:20px}
.tb-segmented button[aria-pressed=true]{background:var(--tb-heading);color:var(--tb-page)}
.tb-size-row{display:flex;align-items:center;gap:8px}
.tb-size-row output{flex:1;text-align:center;font:600 13px/1 ${FONTS.heading};color:var(--tb-secondary)}
.tb-size-row button{all:unset;cursor:pointer;width:44px;height:40px;border:1px solid var(--tb-border);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--tb-heading);font-family:${FONTS.body}}
.tb-size-row button[disabled]{opacity:.35;cursor:default}
.tb-link-btn{all:unset;cursor:pointer;font:600 13px/1.4 ${FONTS.heading};color:var(--tb-link);padding:10px 0;min-height:24px}
.tb-bookmarks{margin-top:20px}
.tb-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;
