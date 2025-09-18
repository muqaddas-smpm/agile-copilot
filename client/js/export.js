// client/js/export.js
// Day 9: "Download .md" button functionality

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('downloadMdBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // 1) Figure out today's date for the file name
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const fileName = `agile-copilot-standup-${yyyy}-${mm}-${dd}.md`;

    // 2) Grab the summary text from the page (it tries multiple common spots)
    const summaryText = getSummaryText();
    if (!summaryText) {
      alert('I could not find the summary on the page. Please generate it first, then click Download again.');
      return;
    }

    // 3) Build simple Markdown content
    const md = [
  '---',
  `date: ${yyyy}-${mm}-${dd}`,
  'project: Agile Copilot',
  'format: standup',
  '---',
  '',
  `# Daily Standup Summary — ${yyyy}-${mm}-${dd}`,
  '',
  '---',
  '',
  summaryText.trim()
].join('\r\n');

    // 4) Trigger a file download (works from file:/// too)
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
});

// Looks for common IDs/classes/elements where your summary might appear.
// Works whether it's in a <div>, <pre>, or <textarea>.
function getSummaryText() {
  const selectors = [
    '#aiSummary',
    '#summary',
    '#summaryOutput',
    '#result',
    '#output',
    '.summary',
    'pre',
    'textarea'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const text = ('value' in el) ? el.value : el.textContent;
    if (text && text.trim().length > 0) return text.trim();
  }
  return '';
}
