// The look shared by the pages the server shows in a browser: signing in for an AI app
// (mcp/pages.ts) and choosing a new password (auth/pages.ts).

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** A password box with a Show/Hide button; the page needs PASSWORD_TOGGLE_SCRIPT. */
export function passwordField(label: string, name: string, autocomplete: string): string {
  return `<label>${escapeHtml(label)}
    <span class="password"><input name="${name}" type="password" autocomplete="${autocomplete}" required minlength="8">
    <button type="button" class="toggle" aria-label="Show password" data-toggle-password>Show</button></span>
  </label>`;
}

export const PASSWORD_TOGGLE_SCRIPT = `
for (const button of document.querySelectorAll('[data-toggle-password]')) {
  button.addEventListener('click', () => {
    const input = button.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
}`;

export function page(title: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · StudyMe</title>
<style>
  :root { --primary:#2f6bd8; --primary-dark:#2455b0; --page:#f9fafb; --surface:#eef1f5; --line:#e1e5eb;
          --ink:#1f2933; --muted:#5c6773; --alert:#dc3b3b; --white:#fff; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:var(--page); color:var(--ink);
         font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         display:flex; align-items:flex-start; justify-content:center; padding:48px 16px; }
  main { width:100%; max-width:420px; display:flex; flex-direction:column; gap:16px; }
  .brand { font-weight:800; color:var(--primary); font-size:18px; }
  h1 { margin:0; font-size:26px; font-weight:800; }
  p { margin:0; color:var(--muted); }
  .card { background:var(--white); border:1px solid var(--line); border-radius:20px; padding:20px;
          display:flex; flex-direction:column; gap:14px; }
  label { display:flex; flex-direction:column; gap:6px; font-size:14px; font-weight:600; }
  input { font:inherit; padding:12px 14px; border:1.5px solid var(--line); border-radius:12px; background:var(--surface); color:var(--ink); }
  input:focus { outline:none; border-color:var(--primary); background:var(--white); }
  button { font:inherit; font-weight:700; border:0; border-radius:14px; padding:13px 16px; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
  .primary { background:var(--primary); color:var(--white); }
  .primary:hover:not(:disabled) { background:var(--primary-dark); }
  .secondary { background:var(--surface); color:var(--ink); }
  .link { background:none; color:var(--primary); padding:4px; font-weight:600; }
  .row { display:flex; gap:10px; } .row > * { flex:1; }
  .or { display:flex; align-items:center; gap:10px; color:var(--muted); font-size:14px; }
  .or::before, .or::after { content:""; flex:1; height:1px; background:var(--line); }
  ul { margin:0; padding-left:20px; color:var(--ink); } li { margin:4px 0; }
  .error { color:var(--alert); font-size:14px; min-height:1em; }
  .small { font-size:14px; }
  .password { position:relative; display:flex; } .password input { flex:1; padding-right:72px; }
  .toggle { position:absolute; right:6px; top:50%; transform:translateY(-50%); background:none; color:var(--primary);
            padding:6px 10px; font-size:14px; font-weight:600; }
  .done { color:var(--ink); }
</style>
</head>
<body><main>
<div class="brand">StudyMe</div>
${body}
</main>
${script}
</body>
</html>`;
}
