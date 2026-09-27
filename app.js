'use strict';
(() => {
  const {pages, categories} = window.WIKI_DATA;
  const entries = Object.values(pages);
  const main = document.querySelector('#main');
  const searchInput = document.querySelector('#search-input');
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = text => text.replaceAll('_', ' ').trim().toLocaleLowerCase();
  const lookup = new Map(Object.keys(pages).map(t => [normalize(t), t]));
  const href = (title, section='') => '#/page/' + encodeURIComponent(title) + (section ? '?section=' + encodeURIComponent(section.replaceAll(' ', '_')) : '');
  const plainText = new Map(entries.map(p => [p.title, p.displaySource.replace(/\[\[(?:File|Image):[^\]]*\]\]|\{\{[^{}]*\}\}|<[^>]+>/gi, ' ').replace(/[\[\]{}|=*#']/g, '').replace(/\s+/g,' ').trim()]));
  const namespaceNames = {'0':'Articles','1':'Talk','2':'User pages','4':'Project','8':'Wiki settings','14':'Categories'};
  document.querySelector('#page-count').textContent = entries.length.toLocaleString();
  let view = 'read';
  let activePage = null;
  let lastRoute = '';
  const pageLink = (title, label=title) => `<a href="${href(title)}">${escape(label)}</a>`;
  const heading = title => `<h1>${escape(title)}</h1>`;
  const breadcrumbs = title => `<div class="breadcrumbs">${pageLink('Main Page','Wiki')}<span>/</span><span>${escape(title)}</span></div>`;

  function renderPage(requested, section) {
    let title = Object.hasOwn(pages,requested) ? requested : lookup.get(normalize(requested));
    if (!title) {
      activePage = null;
      const members = requested.startsWith('Category:') ? categories[requested.slice(9)] : null;
      main.innerHTML = members
        ? `<div class="simple-page">${breadcrumbs(requested)}${heading(requested.slice(9))}<div class="directory-list">${members.map(t=>pageLink(t)).join('')}</div></div>`
        : `<div class="simple-page">${heading(requested)}<p>Page not found.</p></div>`;
      return;
    }
    const visited = new Set();
    const from = [];
    while (pages[title].redirect && !visited.has(title)) {
      visited.add(title); from.push(title);
      const target = lookup.get(normalize(pages[title].redirect));
      if (!target) break;
      title = target;
    }
    const page = activePage = pages[title];
    const toc = page.headings.map(h=>`<a class="toc-level-${h.level}" href="${href(requested,h.id)}">${escape(h.title)}</a>`).join('');
    const content = view === 'source'
      ? `<p><button id="download-source">Download source</button></p><pre class="source-code">${escape(page.source)}</pre>`
      : page.html;
    main.innerHTML = `<div class="article-wrap">
      ${breadcrumbs(title)}${heading(title)}
      <div class="article-tabs">
        <button data-view="read" class="${view==='read'?'selected':''}">Read</button>
        <button data-view="source" class="${view==='source'?'selected':''}">Original source</button>
        ${from.length?'<button id="redirect-source">Redirect source</button>':''}
      </div>
      ${from.length?`<pre class="source-code" id="redirect-code" hidden>${escape(pages[from[0]].source)}</pre>`:''}
      <div class="article-layout${toc && view==='read'?'':' no-contents'}">
        <article id="article-content" class="wiki-content">${content}
          ${view==='read' && page.categories.length?`<div class="category-tags"><span>Categories</span>${page.categories.map(c=>pageLink('Category:'+c,c)).join('')}</div>`:''}
        </article>
        ${toc && view==='read'?`<aside class="contents-panel"><div class="eyebrow">Contents</div>${toc}</aside>`:''}
      </div>
    </div>`;
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view; renderPage(requested,section);});
    document.querySelector('#redirect-source')?.addEventListener('click',()=>{const s=document.querySelector('#redirect-code');s.hidden=!s.hidden;});
    document.querySelector('#download-source')?.addEventListener('click',()=>{
      const objectUrl=URL.createObjectURL(new Blob([page.source],{type:'text/plain;charset=utf-8'}));
      const a=document.createElement('a');a.href=objectUrl;a.download=title.replace(/[<>:"/\\|?*]/g,'_')+'.wikitext';a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
    });
  }

  function directory() {
    activePage=null;
    main.innerHTML=`<div class="simple-page">${heading('All pages')}
      <div class="directory-controls"><input type="search" id="directory-search" placeholder="Filter pages" aria-label="Filter pages by title">
        <select id="namespace-filter" aria-label="Filter page type"><option value="all">All types (${entries.length})</option>${Object.entries(namespaceNames).map(([id,n])=>`<option value="${id}">${n} (${entries.filter(p=>p.ns===Number(id)).length})</option>`).join('')}</select>
      </div><p class="result-count" id="directory-count"></p><div id="directory-results" class="directory-list"></div></div>`;
    const update=()=>{
      const q=normalize(document.querySelector('#directory-search').value);
      const ns=document.querySelector('#namespace-filter').value;
      const rows=entries.filter(p=>(ns==='all'||p.ns===Number(ns))&&normalize(p.title).includes(q)).sort((a,b)=>a.title.localeCompare(b.title));
      document.querySelector('#directory-count').textContent=`${rows.length.toLocaleString()} pages`;
      document.querySelector('#directory-results').innerHTML=rows.map(p=>`<a href="${href(p.title)}"><span>${escape(p.title)}</span><small>${p.redirect?'Redirect':namespaceNames[p.ns]||'Page'}</small></a>`).join('')||'<p>No matching pages.</p>';
    };
    document.querySelector('#directory-search').oninput=update;
    document.querySelector('#namespace-filter').onchange=update;
    update();
  }

  function search(query) {
    activePage=null; searchInput.value=query;
    const terms=normalize(query).split(/\s+/).filter(Boolean);
    const results=terms.length?entries.map(p=>{
      const title=normalize(p.title), source=normalize(plainText.get(p.title));
      const matches=terms.every(t=>title.includes(t)||source.includes(t));
      return {p,score:matches?(title===normalize(query)?100:0)+terms.reduce((s,t)=>s+(title.includes(t)?12:1),0)+(p.ns===0?4:0):0};
    }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.p.title.localeCompare(b.p.title)):[];
    main.innerHTML=`<div class="simple-page">${heading(query?'Results for “'+query+'”':'Search')}
      <p class="result-count">${results.length.toLocaleString()} results</p>
      <div class="search-results">${results.map(({p})=>{
        const source=plainText.get(p.title), first=source.toLocaleLowerCase().indexOf(terms[0]), start=Math.max(0,first-65);
        return `<a class="search-result" href="${href(p.title)}"><small>${namespaceNames[p.ns]||'Page'}</small><h2>${escape(p.title)}</h2><p>${start?'…':''}${escape(source.slice(start,start+220))}${source.length>start+220?'…':''}</p></a>`;
      }).join('')}</div></div>`;
  }

  function route() {
    const route=location.hash.slice(1)||'/page/Main%20Page';
    const base=route.split('?')[0];
    if(base!==lastRoute){view='read';window.scrollTo(0,0);}lastRoute=base;
    const section=new URLSearchParams(route.split('?')[1]||'').get('section');
    document.body.classList.remove('menu-open');document.querySelector('#menu-toggle').setAttribute('aria-expanded','false');
    try {
      if(base==='/all') directory();
      else if(route.startsWith('/search/')) search(decodeURIComponent(route.slice(8)));
      else if(base==='/about') { location.replace(href('Main Page')); return; }
      else renderPage(decodeURIComponent(base.replace(/^\/page\//,'')),section);
    } catch(error) {
      console.error(error);main.innerHTML='<div class="simple-page"><h1>Unable to open page</h1></div>';
    }
    document.title=(activePage?.title||(base==='/all'?'All pages':'Search'))+' · Days Bygone';
    document.querySelectorAll('.sidebar nav a').forEach(a=>{
      const selected=a.dataset.page===activePage?.title||a.getAttribute('href')==='#'+base;
      a.classList.toggle('active',selected);
      if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
    if(section) requestAnimationFrame(()=>{
      let el=document.getElementById(section);
      if(!el)el=[...document.querySelectorAll('.wiki-content [id]')].find(e=>normalize(e.id)===normalize(section));
      el?.scrollIntoView({block:'start'});
    });
  }
  document.querySelector('#search-form').onsubmit=e=>{e.preventDefault();const q=searchInput.value.trim();if(q)location.hash='/search/'+encodeURIComponent(q);};
  document.addEventListener('keydown',e=>{
    if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();searchInput.focus();}
    if(e.key==='Escape'){searchInput.blur();document.body.classList.remove('menu-open');document.querySelector('#menu-toggle').setAttribute('aria-expanded','false');}
  });
  document.querySelector('#menu-toggle').onclick=()=>{const open=document.body.classList.toggle('menu-open');document.querySelector('#menu-toggle').setAttribute('aria-expanded',String(open));};
  const updateThemeLabel=()=>{document.querySelector('#theme-toggle').textContent=document.documentElement.dataset.theme==='dark'?'Light mode':'Dark mode';};
  updateThemeLabel();
  document.querySelector('#theme-toggle').onclick=()=>{
    const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;updateThemeLabel();
    try{localStorage.setItem('dbg-theme',theme);}catch{}
  };
  window.addEventListener('hashchange',route);route();
})();
