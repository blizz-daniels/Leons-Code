const fields = ['html-source', 'css-source', 'js-source'].map((id) => document.getElementById(id));
const initial = fields.map((field) => field.value);
const preview = document.getElementById('preview');
const render = () => {
  const [html, css, javascript] = fields.map((field) => field.value);
  // The learner's code is deliberately sent only to a sandboxed opaque-origin frame.
  preview.srcdoc = `<!doctype html><meta charset="utf-8"><style>${css.replace(/<\/style/gi, '<\\/style')}</style>${html.replace(/<\/script/gi, '<\\/script')}<script>${javascript.replace(/<\/script/gi, '<\\/script')}<\\/script>`;
};
document.getElementById('run-preview').addEventListener('click', render);
document.getElementById('reset-preview').addEventListener('click', () => { fields.forEach((field, index) => { field.value = initial[index]; }); render(); });
render();
