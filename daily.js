/**
 * daily.js — Unified HTML Parser for Multiple Versions
 * Author: dom6027
 * Description: Automatically picks from three embedded HTML versions,
 * merges main article, sidebar widgets, and newsletter sections, and saves as JSON.
 */

const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

// ----------------------------
// Embedded HTML Versions
// ----------------------------
const htmlVersions = [
`<!-- Version -2 HTML -->
<div id="wrapper" class="wide" style="height: auto !important;">
<header id="header">
<!-- ...rest of -2 HTML content... -->
</div>`,

`<!-- Version -1 HTML -->
<div id="wrapper" class="wide" style="height: auto !important;">
<header id="header">
<!-- ...rest of -1 HTML content... -->
</div>`,

`<!-- Current Version HTML -->
<div id="wrapper" class="wide" style="height: auto !important;">
<header id="header">
<!-- ...rest of current HTML content... -->
</div>`
];

// ----------------------------
// Pick all valid versions
// ----------------------------
function pickValidHTML() {
    return htmlVersions.filter(html => html && html.includes('<article'));
}

// ----------------------------
// Parse HTML content
// ----------------------------
function parseHTML(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Main article
    const article = document.querySelector('article.post');
    const title = article?.querySelector('.entry_title')?.textContent || '';
    const content = article?.querySelector('.entry_content')?.innerHTML || '';

    // Sidebar widgets
    const sidebar = document.querySelector('.col_3_of_12');
    const widgets = [];
    if (sidebar) {
        sidebar.querySelectorAll('.widget').forEach(widget => {
            const widgetTitle = widget.querySelector('h3, h4')?.textContent || '';
            widgets.push({ title: widgetTitle, html: widget.innerHTML });
        });
    }

    // Newsletter / Signup sections
    const newsletterSections = [];
    document.querySelectorAll('#mc_embed_signup').forEach(section => {
        newsletterSections.push(section.innerHTML);
    });

    return { title, content, widgets, newsletterSections };
}

// ----------------------------
// Merge all valid versions
// ----------------------------
function mergeHTMLVersions(validHTMLArray) {
    const merged = {
        title: '',
        content: '',
        widgets: [],
        newsletterSections: []
    };

    validHTMLArray.forEach(html => {
        const parsed = parseHTML(html);

        // Prefer first non-empty title
        if (!merged.title && parsed.title) merged.title = parsed.title;

        // Merge content
        if (parsed.content) merged.content += parsed.content + '\n';

        // Merge widgets (avoid duplicates by title)
        parsed.widgets.forEach(w => {
            if (!merged.widgets.find(existing => existing.title === w.title)) {
                merged.widgets.push(w);
            }
        });

        // Merge newsletter sections (avoid duplicates)
        parsed.newsletterSections.forEach(n => {
            if (!merged.newsletterSections.includes(n)) merged.newsletterSections.push(n);
        });
    });

    return merged;
}

// ----------------------------
// Save JSON
// ----------------------------
function saveJSON(data) {
    const file = 'article_parsed.json';
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✅ Parsed and merged content saved to ${file}`);
}

// ----------------------------
// Main Run
// ----------------------------
try {
    const validHTML = pickValidHTML();
    if (validHTML.length === 0) throw new Error('No valid HTML version found!');

    const mergedData = mergeHTMLVersions(validHTML);
    saveJSON(mergedData);
} catch (err) {
    console.error('❌ Error:', err.message);
}
