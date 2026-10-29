/* global window, document, navigator, localStorage, location, history, fetch, AbortController, URLSearchParams, IntersectionObserver, matchMedia, crypto */
(() => {
  'use strict';

  const SECTION_ORDER = ['tech', 'economy', 'diplomacy', 'politics', 'science', 'world'];
  const SECTION_LABELS = {
    tech: '科技', economy: '经济', diplomacy: '外交', politics: '政治', science: '科学', world: '国际',
  };
  const SECTION_COLORS = {
    tech: '#236b68', economy: '#9a6a25', diplomacy: '#7a4b72',
    politics: '#a9442f', science: '#3c628b', world: '#4f5c4c',
  };
  const CLASS_LABELS = {
    independent: '独立媒体', official: '官方机构', state: '国家媒体', thinktank: '智库',
  };
  const CACHE_KEY = 'dailybrief.cachedEdition.v1';
  const BM_KEY = 'dailybrief.bookmarks.v1';
  const THEME_KEY = 'dailybrief.theme';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    edition: null,
    editions: [],
    status: null,
    currentDate: null,
    searchIndex: [],
    searchQuery: '',
    searchFilter: 'all',
    bookmarks: loadBookmarks(),
    sourcesData: null,
    infoMode: null,
    lastFocus: null,
    loading: false,
    refreshing: false,
    refreshTimer: null,
    countdownTimer: null,
    emptyTimer: null,
    fontScale: 1,
    installPrompt: null,
    offline: !navigator.onLine,
    observers: [],
  };

  /* ------------------------------------------------------------------ *
   * Utilities
   * ------------------------------------------------------------------ */

  function esc(value = '') {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''), location.origin);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function icon(name, cls = '') {
    return `<svg${cls ? ` class="${esc(cls)}"` : ''} aria-hidden="true"><use href="#i-${esc(name)}"></use></svg>`;
  }

  function pad(n, len = 2) {
    return String(n).padStart(len, '0');
  }

  function dateKeyOf(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  }

  function parseDate(dateString) {
    if (!dateString) return null;
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateString) ? `${dateString}T12:00:00+08:00` : dateString);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatLongDate(dateString) {
    const d = parseDate(dateString);
    if (!d) return '日期未知';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    }).format(d);
  }

  function formatMonth(dateString) {
    const d = parseDate(dateString);
    if (!d) return '';
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long' }).format(d);
  }

  function formatYear(dateString) {
    const d = parseDate(dateString);
    if (!d) return '';
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(d);
  }

  function formatWeekday(dateString) {
    const d = parseDate(dateString);
    if (!d) return '';
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long' }).format(d);
  }

  function formatClock(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const minutes = Math.max(0, Math.round(diff / 60000));
    if (minutes < 2) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.round(minutes / 60);
    if (hours < 12) return `${hours} 小时前`;
    if (dateKeyOf(d) === dateKeyOf()) return `今天 ${formatClock(iso)}`;
    const yesterday = new Date(Date.now() - 864e5);
    if (dateKeyOf(d) === dateKeyOf(yesterday)) return `昨天 ${formatClock(iso)}`;
    return formatDateTime(iso);
  }

  function issueNumber(dateString) {
    const d = parseDate(dateString);
    if (!d) return '001';
    const start = Date.UTC(2026, 0, 1);
    return pad(Math.max(1, Math.floor((d.getTime() - start) / 864e5) + 1), 3);
  }

  function storyTitle(story) {
    return story?.title_zh || story?.title_en || '未命名报道';
  }

  function storySummary(story) {
    return story?.summary_zh || story?.summary_en || '信源未提供摘要。';
  }

  function findStory(id) {
    return state.edition?.stories?.find((s) => s.id === id) || null;
  }

  function classLabel(value) {
    return CLASS_LABELS[value] || '媒体';
  }

  function sectionLabel(value) {
    return SECTION_LABELS[value] || value || '国际';
  }

  function getSection(sectionId) {
    return state.edition?.sections?.find((s) => s.id === sectionId) || null;
  }

  function loadBookmarks() {
    try {
      const raw = JSON.parse(localStorage.getItem(BM_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  }

  function saveBookmarks() {
    try { localStorage.setItem(BM_KEY, JSON.stringify(state.bookmarks)); } catch { /* ignore */ }
  }

  function bookmarkKey(story, date = state.edition?.date) {
    return `${date}:${story.id}`;
  }

  function isSaved(story) {
    return Boolean(state.bookmarks[bookmarkKey(story)]);
  }

  function savedCount() {
    return Object.keys(state.bookmarks).length;
  }

  function toast(message, isError = false) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', isError);
    el.classList.add('is-visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('is-visible'), 3400);
  }

  function sleep(ms) {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
  }

  async function getJson(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 18000);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(options.headers || {}) },
        cache: 'no-store',
      });
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok) {
        const error = new Error(data?.error || `HTTP ${res.status}`);
        error.status = res.status;
        error.data = data;
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ------------------------------------------------------------------ *
   * Rendering primitives
   * ------------------------------------------------------------------ */

  function sourceDots(sources = [], max = 4) {
    const seen = new Set();
    const unique = [];
    for (const source of sources) {
      if (!source || seen.has(source.id)) continue;
      seen.add(source.id);
      unique.push(source);
    }
    if (!unique.length) return '';
    const visible = unique.slice(0, max);
    const rest = unique.length - visible.length;
    return `<span class="source-dots" aria-hidden="true">${visible.map((source) => (
      `<i class="source-dot" data-class="${esc(source.class)}" title="${esc(source.name)}">${esc((source.short || source.name || '?').slice(0, 4))}</i>`
    )).join('')}${rest > 0 ? `<i class="source-dot more">+${rest}</i>` : ''}</span>`;
  }

  function verifyBadge(story) {
    const v = story?.verification || {};
    const level = v.level || 'single';
    const label = v.label || '待核验';
    const count = v.independentCount >= 2 ? ` · ${v.independentCount} 源` : '';
    const iconName = level === 'strong' || level === 'cross' ? 'check' : 'info';
    return `<span class="verify-badge ${esc(level)}">${icon(iconName, 'badge-icon')}${esc(label)}${esc(count)}</span>`;
  }

  function bookmarkButton(story, cls = 'bookmark-btn') {
    const saved = isSaved(story);
    return `<button class="${esc(cls)}${saved ? ' is-saved' : ''}" type="button" data-bookmark="${esc(story.id)}" aria-label="${saved ? '取消收藏' : '收藏此条'}" aria-pressed="${saved}">${icon('bookmark')}</button>`;
  }

  function storyTags(story, count = 2) {
    const tags = (story.tags || []).slice(0, count);
    return tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('');
  }

  function storySourceLine(story) {
    const v = story.verification || {};
    return `<span class="source-inline">${esc(v.sourceCount || story.sourceCount || 1)} 家信源 · ${esc(story.articleCount || 1)} 篇报道</span>`;
  }

  function coverUrl(edition) {
    const base = safeUrl(edition?.image);
    if (!base) return '/icons/cover-fallback.svg';
    const version = edition?.generatedAt ? `v=${encodeURIComponent(edition.generatedAt)}` : '';
    return version ? `${base}${base.includes('?') ? '&' : '?'}${version}` : base;
  }

  /* ------------------------------------------------------------------ *
   * Edition rendering
   * ------------------------------------------------------------------ */

  function renderEdition() {
    const edition = state.edition;
    if (!edition) return;
    const view = $('#editionView');
    const hero = edition.hero || edition.stories?.[0];
    if (!hero) {
      showEmpty('本期没有可展示的报道。');
      return;
    }
    const topStories = (edition.topStories?.length ? edition.topStories : (edition.stories || []).slice(1, 4)).filter(Boolean);
    const topIds = new Set(topStories.map((s) => s.id));
    const shownIds = new Set([hero.id, ...topIds]);

    const heroHtml = renderHero(edition, hero);
    const briefHtml = renderBriefs(edition);
    const topHtml = renderTopStories(topStories);

    let sectionIndex = 0;
    const sectionHtml = SECTION_ORDER.map((sectionId) => {
      const section = getSection(sectionId);
      if (!section || !section.count) return '';
      const all = (edition.stories || []).filter((s) => s.section === sectionId);
      if (!all.length) return '';
      let visible = all.filter((s) => !shownIds.has(s.id));
      if (!visible.length) visible = all.slice(0, 1);
      const lead = visible[0];
      const rows = visible.slice(1, 5);
      const remaining = Math.max(0, all.length - visible.length);
      sectionIndex += 1;
      return renderSection(sectionId, sectionIndex, lead, rows, section.count, remaining);
    }).join('');

    view.innerHTML = `
      <div class="front-grid">
        ${heroHtml}
        ${briefHtml}
      </div>
      ${topHtml}
      <div class="sections" id="sectionsRoot">${sectionHtml}</div>
    `;
    view.hidden = false;
    $('#loadingState').hidden = true;
    $('#emptyState').hidden = true;
    updateMasthead(edition);
    updateRail(edition);
    updateRightRail(edition);
    updateStatusUI();
    state.searchIndex = buildSearchIndex(edition);
    observeView();
  }

  function renderHero(edition, story) {
    const title = storyTitle(story);
    const summary = storySummary(story);
    const v = story.verification || {};
    const providerNote = edition.imageProvider === 'comfyui' ? '本地模型生成封面' : '编辑生成封面';
    return `<article class="hero reveal" id="top" data-story="${esc(story.id)}" tabindex="0" role="button" aria-label="打开头条：${esc(title)}">
      <div class="hero-media">
        <img src="${esc(coverUrl(edition))}" alt="本期封面插画" fetchpriority="high" decoding="async" title="${esc(providerNote)}">
      </div>
      <div class="hero-content">
        ${edition.imageProvider === 'comfyui' ? '<span class="hero-credit">LOCAL MODEL · 本地生成封面</span>' : ''}
        <div class="hero-eyebrow">
          <span class="tag">头条</span>
          <span class="hero-section">${esc(story.sectionLabel || sectionLabel(story.section))}</span>
          ${story.summaryProvider === 'llm' ? '<span class="tag tag-ai">AI 综合</span>' : ''}
          <span class="dot"></span>
          <span class="hero-verify">${icon('check')}${esc(v.sourceCount || 1)} 家信源${v.independentCount >= 2 ? ` · ${esc(v.independentCount)} 家独立` : ''}</span>
        </div>
        <h1>${esc(title)}</h1>
        <p class="hero-dek">${esc(summary)}</p>
        <div class="hero-foot">
          <div class="hero-sources">${sourceDots(story.sources || [], 4)}<span>${esc(v.sourceCount || 1)} 家信源 · ${esc(story.articleCount || 1)} 篇</span></div>
          <span class="hero-open">阅读核验详情 ${icon('arrow-ne')}</span>
        </div>
      </div>
    </article>`;
  }

  function renderBriefs(edition) {
    const briefs = (edition.brief || []).slice(0, 6);
    const note = edition.editorNote || '';
    return `<aside class="front-side reveal" aria-label="今日导读">
      <div class="front-kicker"><span>今日导读 / In this issue</span><b>${esc(pad((edition.stories || []).length, 2))} 条线索</b></div>
      <ol class="brief-list">
        ${briefs.map((brief, index) => `<li><button type="button" data-story="${esc(brief.id)}">
          <span class="num">${esc(pad(index + 1, 2))}</span>
          <span class="brief-body">
            <span class="brief-meta"><span>${esc(brief.section || '国际')}</span><i class="mini-dot"></i><span>${esc(brief.verification || '')}</span></span>
            <h3>${esc(brief.title || brief.title_en)}</h3>
          </span>
        </button></li>`).join('') || '<li class="muted-line">暂无导读。</li>'}
      </ol>
      <div class="editor-note">
        <div class="editor-note-label">编辑手记</div>
        <p>${esc(note)}</p>
      </div>
    </aside>`;
  }

  function renderTopStories(stories) {
    if (!stories.length) return '';
    return `<section class="top-grid reveal" aria-label="今日焦点">
      ${stories.map((story) => `<article class="top-card" data-section="${esc(story.section)}" data-story="${esc(story.id)}" tabindex="0" role="button" aria-label="打开：${esc(storyTitle(story))}" style="--section-color:${SECTION_COLORS[story.section] || 'var(--accent)'}">
        <div class="top-meta">
          <span class="tag tag-section">${esc(story.sectionLabel || sectionLabel(story.section))}</span>
          ${story.summaryProvider === 'llm' ? '<span class="tag tag-ai">AI 综合</span>' : ''}
          ${verifyBadge(story)}
        </div>
        <h3>${esc(storyTitle(story))}</h3>
        <p>${esc(storySummary(story))}</p>
        <div class="top-foot">
          <div style="display:flex;align-items:center;gap:7px;min-width:0">${sourceDots(story.sources || [], 3)}${storySourceLine(story)}</div>
          <span class="top-open" aria-hidden="true">${icon('arrow-ne')}</span>
        </div>
      </article>`).join('')}
    </section>`;
  }

  function renderSection(sectionId, index, lead, rows, total, remaining) {
    const section = getSection(sectionId) || { label: sectionLabel(sectionId), en: '', kicker: '' };
    if (!lead) return '';
    const leadId = lead.id;
    return `<section class="section-block reveal" id="section-${esc(sectionId)}" data-section="${esc(sectionId)}">
      <header class="section-head">
        <div class="section-index">${esc(pad(index, 2))}</div>
        <div>
          <h2 class="section-title">${esc(section.label || sectionLabel(sectionId))}</h2>
          <p class="section-sub">${esc(section.en || sectionLabel(sectionId))} · ${esc(section.kicker || '')}</p>
        </div>
        <div class="section-count"><b>${esc(total)}</b> 条 / 本期</div>
      </header>
      <div class="section-body${rows.length ? '' : ' is-solo'}">
        <article class="section-lead" data-story="${esc(leadId)}" tabindex="0" role="button" aria-label="打开：${esc(storyTitle(lead))}">
          <div class="lead-meta">
            ${storyTags(lead, 2)}
            ${verifyBadge(lead)}
            <span class="story-time">${esc(relativeTime(lead.publishedAt))}</span>
          </div>
          <h3>${esc(storyTitle(lead))}</h3>
          <p>${esc(storySummary(lead))}</p>
          <div class="lead-foot">
            <div style="display:flex;align-items:center;gap:7px;min-width:0">${sourceDots(lead.sources || [], 4)}${storySourceLine(lead)}</div>
            <span class="lead-open">阅读 ${icon('arrow-ne')}</span>
          </div>
        </article>
        ${rows.length ? `<ol class="story-list">
          ${rows.map((story, i) => renderStoryRow(story, i + 2)).join('')}
        </ol>` : ''}
      </div>
      ${remaining > 0 ? `<p class="section-more">另有 ${remaining} 条相关报道，可在搜索中查看。</p>` : ''}
    </section>`;
  }

  function renderStoryRow(story, number) {
    return `<li class="story-row" data-story="${esc(story.id)}" tabindex="0" role="button" aria-label="打开：${esc(storyTitle(story))}">
      <span class="row-num">${esc(pad(number, 2))}</span>
      <div class="row-body">
        <div class="row-meta">${storyTags(story, 1)}${story.summaryProvider === 'llm' ? '<span class="tag tag-ai">AI</span>' : ''}${verifyBadge(story)}<span class="story-time">${esc(relativeTime(story.publishedAt))}</span></div>
        <h4>${esc(storyTitle(story))}</h4>
        <p class="row-summary">${esc(storySummary(story))}</p>
        <div class="row-foot">${sourceDots(story.sources || [], 3)}${storySourceLine(story)}${bookmarkButton(story)}</div>
      </div>
      <span class="row-open" aria-hidden="true">${icon('arrow-ne')}</span>
    </li>`;
  }

  function updateMasthead(edition) {
    const date = edition.date || dateKeyOf();
    $('#mastDate').textContent = formatLongDate(date);
    $('#mastIssue').textContent = `第 ${issueNumber(date)} 期`;
    $('#dateMonth').textContent = formatMonth(date);
    $('#dateYear').textContent = formatYear(date);
    $('#dateDay').textContent = pad(parseDate(date)?.getDate?.() || '', 2);
    $('#dateWeekday').textContent = formatWeekday(date);
    $('#dateIssue').textContent = `第 ${issueNumber(date)} 期`;
    $('#footerYear').textContent = formatYear(date);
    $('#pulseDate').textContent = date.slice(5).replace('-', '.');
    $('#archiveSelect').value = date;
    document.title = `${storyTitle(edition.hero)} · 晨间简报`;
    updateDateNav();
  }

  function updateRail(edition) {
    const counts = new Map((edition.sections || []).map((s) => [s.id, s.count]));
    for (const link of $$('.rail-nav a[data-nav]')) {
      const id = link.dataset.nav;
      const em = link.querySelector('em');
      if (em) em.textContent = counts.has(id) ? pad(counts.get(id), 2) : '—';
    }
    for (const link of $$('.section-nav a[data-nav]')) {
      const id = link.dataset.nav;
      link.title = counts.has(id) ? `${counts.get(id)} 条报道` : '本期暂无';
    }
    const count = savedCount();
    $('#savedCount').textContent = count;
    $('#savedCountTop').textContent = count;
    $('#updateTimeLabel').textContent = edition.updateTime || '18:30';
    $('#lastUpdated').textContent = edition.generatedAt ? `更新于 ${formatClock(edition.generatedAt)}` : '存档';
  }

  function updateRightRail(edition) {
    const stats = edition.stats || {};
    $('#statSources').textContent = stats.feedsOk ?? stats.sources ?? '—';
    $('#statArticles').textContent = stats.articlesUsed ?? stats.articlesFetched ?? '—';
    $('#statStories').textContent = stats.stories ?? (edition.stories || []).length;
    $('#statVerified').textContent = stats.verified ?? '—';
    const aiNote = edition.aiSummary?.status === 'ok'
      ? ` · ${edition.aiSummary.summarized} 条 AI 摘要`
      : '';
    $('#pulseNote').textContent = `${stats.countries || 0} 个国家/地区 · ${stats.categories || 0} 个栏目 · ${stats.independentSources || 0} 家独立信源${aiNote}`;
    const verified = [...(edition.stories || [])]
      .filter((s) => (s.verification?.independentCount || 0) >= 1)
      .sort((a, b) => (b.verification?.independentCount || 0) - (a.verification?.independentCount || 0)
        || (b.verification?.score || 0) - (a.verification?.score || 0))
      .slice(0, 4);
    $('#verifiedList').innerHTML = verified.length ? verified.map((story, i) => `<li><button type="button" data-story="${esc(story.id)}">
      <span class="num">${esc(pad(i + 1, 2))}</span>
      <span class="compact-body">
        <h4>${esc(storyTitle(story))}</h4>
        <span class="compact-meta">${esc(story.verification?.label || '已核验')} · ${esc(story.verification?.independentCount || 0)} 家独立信源</span>
      </span>
    </button></li>`).join('') : '<li class="muted-line">本期暂无多源印证条目。</li>';
    renderSourceMix(edition);
  }

  function renderSourceMix(edition) {
    const groups = new Map();
    for (const story of edition.stories || []) {
      for (const source of story.sources || []) {
        const key = source.class || 'independent';
        if (!groups.has(key)) groups.set(key, new Set());
        groups.get(key).add(source.id);
      }
    }
    const colors = { independent: '#236b68', official: '#9a6a25', state: '#a9442f', thinktank: '#6a5d4a' };
    const total = Math.max(1, [...groups.values()].reduce((sum, set) => sum + set.size, 0));
    const rows = [...groups.entries()]
      .sort((a, b) => b[1].size - a[1].size)
      .map(([key, set]) => {
        const pct = Math.round((set.size / total) * 100);
        return `<div class="mix-row" style="--c:${colors[key] || '#6a5d4a'};--w:${pct}%">
          <span><i class="mix-swatch"></i>${esc(classLabel(key))}</span><span>${set.size}</span>
          <span class="mix-bar"><i></i></span>
        </div>`;
      }).join('');
    $('#mixBars').innerHTML = rows || '<p class="tiny-note">暂无信源构成数据。</p>';
    const independent = groups.get('independent')?.size || 0;
    const official = (groups.get('official')?.size || 0) + (groups.get('state')?.size || 0);
    $('#mixNote').textContent = `独立信源 ${independent} 家 · 官方/国家媒体 ${official} 家；后者不计入独立印证。`;
  }

  function updateDateNav() {
    const dates = state.editions.map((e) => e.date);
    const index = dates.indexOf(state.currentDate);
    const older = index >= 0 ? dates[index + 1] : null;
    const newer = index > 0 ? dates[index - 1] : null;
    $('#prevDate').disabled = !older;
    $('#nextDate').disabled = !newer;
    $('#todayBtn').disabled = !newer;
    $('#todayBtn').textContent = newer ? '回到最新' : '已是最新';
  }

  function populateArchive() {
    const select = $('#archiveSelect');
    select.innerHTML = state.editions.map((edition) => `<option value="${esc(edition.date)}">${esc(edition.date)} · ${esc(edition.title || '每日简报')}</option>`).join('');
    select.value = state.currentDate || state.editions[0]?.date || '';
  }

  /* ------------------------------------------------------------------ *
   * Data loading
   * ------------------------------------------------------------------ */

  async function loadStatus() {
    try {
      state.status = await getJson('/api/status');
      state.offline = false;
      updateStatusUI();
    } catch (error) {
      state.offline = true;
      updateStatusUI();
    }
  }

  async function loadEditions() {
    try {
      const data = await getJson('/api/editions');
      state.editions = data.editions || [];
      populateArchive();
      updateDateNav();
    } catch {
      state.editions = [];
    }
  }

  async function loadEdition(date, { silent = false, push = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    if (!silent) showLoading(date ? '正在打开这一期…' : '正在打开今日简报…');
    try {
      const url = date ? `/api/editions/${encodeURIComponent(date)}` : '/api/editions/latest';
      const edition = await getJson(url);
      if (!edition?.stories?.length) throw new Error('这一期还没有内容');
      state.edition = edition;
      state.currentDate = edition.date;
      state.offline = false;
      state.searchFilter = 'all';
      state.searchQuery = '';
      hideEmpty();
      renderEdition();
      if (!silent) window.scrollTo({ top: 0, behavior: 'auto' });
      if (push && date) {
        const next = new URL(location.href);
        next.searchParams.set('date', edition.date);
        history.pushState({ date: edition.date }, '', next);
      } else if (date) {
        const next = new URL(location.href);
        next.searchParams.set('date', edition.date);
        history.replaceState({ date: edition.date }, '', next);
      }
      saveCache(edition);
      if (state.editions.length) {
        $('#archiveSelect').value = edition.date;
        updateDateNav();
      }
    } catch (error) {
      if (error.status === 404 && !date) {
        showEmpty('今天的简报正在生成。');
        startEmptyPoll();
      } else if (error.status === 404) {
        toast('没有找到这一期，已切回最新一期。', true);
        state.loading = false;
        return loadEdition(null, { silent: true });
      } else {
        const cached = readCache();
        if (cached?.edition?.stories?.length && (!date || cached.edition.date === date)) {
          state.edition = cached.edition;
          state.currentDate = cached.edition.date;
          state.offline = true;
          hideEmpty();
          renderEdition();
          showOffline(true);
          toast('网络不可用，正在显示最近一次缓存。', true);
        } else {
          showEmpty('无法取得简报数据。');
          $('#emptyText').textContent = '请检查网络或代理设置，然后点击“立即生成”。';
          $('#emptyStatus').textContent = error.message || '';
        }
      }
    } finally {
      state.loading = false;
    }
  }

  function saveCache(edition) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), edition }));
    } catch {
      // A very large edition can exceed localStorage; ignore.
    }
  }

  function readCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return raw?.edition ? raw : null;
    } catch {
      return null;
    }
  }

  function showLoading(caption = '正在打开今日简报…') {
    $('#loadingState').hidden = false;
    $('#emptyState').hidden = true;
    $('#editionView').hidden = true;
    $('#loadingCaption').textContent = caption;
  }

  function hideEmpty() {
    $('#emptyState').hidden = true;
    $('#loadingState').hidden = true;
  }

  function showEmpty(message = '') {
    $('#loadingState').hidden = true;
    $('#editionView').hidden = true;
    $('#emptyState').hidden = false;
    if (message) $('#emptyText').textContent = message;
    updateEmptyStatus();
  }

  function updateEmptyStatus() {
    const status = state.status;
    const el = $('#emptyStatus');
    if (!el) return;
    if (state.refreshing || status?.generating) {
      el.textContent = '正在抓取信源、聚类事件并做交叉核验…\n通常需要 1–3 分钟，请保持此页面打开。';
    } else if (status?.lastError) {
      el.textContent = `上次更新未完成：${status.lastError}`;
    } else {
      el.textContent = status?.nextUpdate ? `下一次计划更新：${status.nextUpdate.label}` : '';
    }
    $('#emptyRefresh').disabled = Boolean(state.refreshing || status?.generating);
    $('#emptyRefresh').textContent = (state.refreshing || status?.generating) ? '正在生成…' : '立即生成';
  }

  function startEmptyPoll() {
    if (state.emptyTimer) return;
    const started = Date.now();
    state.emptyTimer = setInterval(async () => {
      if (Date.now() - started > 8 * 60 * 1000) {
        clearInterval(state.emptyTimer);
        state.emptyTimer = null;
        updateEmptyStatus();
        return;
      }
      try {
        const status = await getJson('/api/status');
        state.status = status;
        updateStatusUI();
        updateEmptyStatus();
        if (!status.generating) {
          const data = await getJson('/api/editions/latest');
          if (data?.stories?.length) {
            clearInterval(state.emptyTimer);
            state.emptyTimer = null;
            state.editions = (await getJson('/api/editions')).editions || state.editions;
            populateArchive();
            await loadEdition(null, { silent: true });
          }
        }
      } catch {
        // Keep polling; the server may still be starting up.
      }
    }, 4500);
  }

  /* ------------------------------------------------------------------ *
   * Status / countdown / refresh
   * ------------------------------------------------------------------ */

  function updateStatusUI() {
    const status = state.status;
    const edition = state.edition;
    let text = '';
    if (state.offline) {
      text = edition ? `离线模式 · 显示 ${edition.date} 存档` : '离线 · 无法连接本地服务';
    } else if (state.refreshing || status?.generating) {
      text = '正在抓取信源、聚类并交叉核验…';
    } else if (edition) {
      const stats = edition.stats || {};
      const ai = edition.aiSummary?.status === 'ok' ? ` · AI 摘要 ${edition.aiSummary.summarized} 条` : '';
      text = `${edition.date} · ${stats.feedsOk ?? stats.sources ?? '—'} 家信源 · ${stats.articlesUsed ?? '—'} 条报道 · ${stats.verified ?? 0} 条交叉印证${ai}`;
    } else if (status) {
      text = `已连接 · ${status.feeds?.ok ?? 0}/${status.feeds?.configured ?? 0} 家信源可用`;
    } else {
      text = '正在连接本地服务…';
    }
    $('#statusText').textContent = text;
    if (status?.lastError && !status.generating) {
      $('#statusText').title = `上次更新失败：${status.lastError}`;
    } else {
      $('#statusText').removeAttribute('title');
    }
    updateCountdown();
    updateEmptyStatus();
  }

  function updateCountdown() {
    const el = $('#countdownText');
    if (!el) return;
    const next = state.status?.nextUpdate;
    if (!next?.at) {
      el.textContent = '下次更新 18:30';
      return;
    }
    const target = new Date(next.at).getTime();
    const left = Math.max(0, target - Date.now());
    if (left <= 0) {
      el.textContent = '正在更新…';
      return;
    }
    const totalSeconds = Math.floor(left / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    el.textContent = `距下次更新 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  function startCountdown() {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    state.countdownTimer = setInterval(updateCountdown, 1000);
    setInterval(() => { loadStatus(); }, 5 * 60 * 1000);
  }

  async function triggerRefresh() {
    if (state.refreshing) {
      toast('本期正在更新，请稍候。');
      return;
    }
    state.refreshing = true;
    $('#refreshBtn').classList.add('is-spinning');
    $('#refreshBtn').disabled = true;
    $('#statusRefresh').disabled = true;
    updateStatusUI();
    toast('已开始更新，通常需要 1–3 分钟。');
    try {
      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast('已有更新在进行中，请稍候。');
      } else if (!res.ok) {
        throw new Error(data.error || `更新请求失败（${res.status}）`);
      }
      const started = Date.now();
      while (Date.now() - started < 7 * 60 * 1000) {
        await sleep(3500);
        const status = await getJson('/api/status');
        state.status = status;
        updateStatusUI();
        if (!status.generating) {
          if (status.lastError) {
            toast(`更新失败：${status.lastError}`, true);
          } else {
            const dataEditions = await getJson('/api/editions');
            state.editions = dataEditions.editions || [];
            populateArchive();
            const target = state.editions[0]?.date || state.currentDate;
            await loadEdition(target, { silent: true });
            toast('本期已更新。');
          }
          return;
        }
      }
      toast('更新仍在进行，请稍后刷新页面。', true);
    } catch (error) {
      toast(error.message || '更新失败，请稍后重试。', true);
    } finally {
      state.refreshing = false;
      $('#refreshBtn').classList.remove('is-spinning');
      $('#refreshBtn').disabled = false;
      $('#statusRefresh').disabled = false;
      updateStatusUI();
    }
  }

  /* ------------------------------------------------------------------ *
   * Story modal
   * ------------------------------------------------------------------ */

  function openStory(id) {
    const story = findStory(id);
    if (!story) {
      toast('没有找到这条报道。', true);
      return;
    }
    state.lastFocus = document.activeElement;
    const body = $('#storyModalBody');
    body.innerHTML = renderStoryModal(story);
    showModal('#storyModal');
    const panel = $('.story-panel');
    if (panel) {
      panel.scrollTop = 0;
      panel.removeEventListener('scroll', onModalScroll);
      panel.addEventListener('scroll', onModalScroll, { passive: true });
    }
    setProgress(0);
    setTimeout(() => {
      $('.story-panel .small-btn')?.focus();
    }, 50);
  }

  function renderStoryModal(story) {
    const v = story.verification || {};
    const sources = story.sources || [];
    const originalTitle = story.title_en && story.title_en !== story.title_zh ? story.title_en : '';
    const saved = isSaved(story);
    const sourceCards = sources.map((source, index) => {
      const sourceTitle = source.title_zh && source.title_zh !== source.title ? source.title_zh : source.title;
      const original = source.title_zh && source.title_zh !== source.title ? source.title : '';
      const link = safeUrl(source.url);
      return `<article class="source-card">
        <span class="source-avatar" data-class="${esc(source.class)}">${esc((source.short || source.name || '?').slice(0, 4))}</span>
        <div class="source-card-body">
          <div class="source-card-top">
            <b>${esc(source.name)}</b>
            <span class="source-country">${esc(source.countryZh || source.country || '')} · ${esc(source.type || classLabel(source.class))}</span>
            <span class="source-angle">${esc(source.angle || '报道')}</span>
            ${source.independent ? '<span class="tag tag-accent">独立</span>' : `<span class="tag">${esc(classLabel(source.class))}</span>`}
          </div>
          <h4>${esc(sourceTitle)}</h4>
          ${original ? `<p class="source-en">${esc(original)}</p>` : ''}
          ${source.summary ? `<p>${esc(source.summary)}</p>` : ''}
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span class="story-time">${esc(relativeTime(source.publishedAt))}</span>
            ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">查看原文 ${icon('external')}</a>` : '<span class="story-time">无可用链接</span>'}
          </div>
        </div>
      </article>`;
    }).join('');
    const facts = [...(v.sharedEntities || []), ...(v.sharedNumbers || [])].slice(0, 8);
    const summaryLabel = story.summaryProvider === 'llm'
      ? `AI 综合摘要 / ${esc(story.summaryModel || 'LLM')}`
      : story.summaryProvider === 'translated'
        ? '中文摘要 / Machine-translated summary'
        : 'RSS 摘要 / Source excerpt';
    return `<header class="story-head">
      <div class="story-tags">
        <span class="tag tag-section">${esc(story.sectionLabel || sectionLabel(story.section))}</span>
        ${verifyBadge(story)}
        ${(story.tags || []).slice(0, 3).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}
      </div>
      <h2 id="storyTitle">${esc(storyTitle(story))}</h2>
      ${originalTitle ? `<p class="story-original">${esc(originalTitle)}</p>` : ''}
      <div class="story-meta-line">
        <span>${esc(formatDateTime(story.publishedAt))}</span><i class="meta-sep"></i>
        <span>${esc(story.readingTime || 1)} 分钟阅读</span><i class="meta-sep"></i>
        <span>${esc(v.sourceCount || sources.length || 1)} 家信源 / ${esc(story.articleCount || 1)} 篇报道</span>
        <div class="story-actions">
          <button class="small-btn${saved ? ' is-saved' : ''}" type="button" data-bookmark="${esc(story.id)}" aria-pressed="${saved}">${icon('bookmark')}${saved ? '已收藏' : '收藏'}</button>
          <button class="small-btn" type="button" data-share-story="${esc(story.id)}">${icon('share')}分享</button>
          ${safeUrl(story.url) ? `<a class="small-btn" href="${esc(safeUrl(story.url))}" target="_blank" rel="noopener noreferrer">${icon('external')}原文</a>` : ''}
        </div>
      </div>
    </header>
    <div class="story-summary">
      <div class="reader-tools" aria-label="阅读字号">
        <button type="button" data-font="-1" aria-label="缩小字号">${icon('minus')}</button>
        <button type="button" data-font="0" aria-label="恢复字号">A</button>
        <button type="button" data-font="1" aria-label="放大字号">${icon('plus')}</button>
      </div>
      <span class="summary-label">${summaryLabel}${story.summaryConfidence ? ` · 置信度 ${esc(story.summaryConfidence)}` : ''}</span>
      <p>${esc(storySummary(story))}</p>
      ${story.why_it_matters ? `<div class="why-box"><span>为什么重要</span><p>${esc(story.why_it_matters)}</p></div>` : ''}
      ${story.key_facts?.length ? `<ul class="key-facts">${story.key_facts.map((fact) => `<li>${esc(fact)}</li>`).join('')}</ul>` : ''}
      ${story.summaryProvider === 'llm' ? `<p class="ai-source-note">AI 摘要基于下方 ${esc(v.sourceCount || sources.length)} 家信源的标题与短摘要生成；模型没有读取全文，事实与数字请回看原文。</p>` : ''}
    </div>
    ${story.image?.url ? `<figure class="story-image">
      <img src="${esc(safeUrl(story.image.url))}" alt="${esc(story.image.alt || storyTitle(story))}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-article-image>
      <figcaption>
        <span>图片：${esc(story.image.credit || '原新闻')}</span>
        ${safeUrl(story.image.creditUrl) ? `<a href="${esc(safeUrl(story.image.creditUrl))}" target="_blank" rel="noopener noreferrer">查看原新闻 ${icon('external')}</a>` : ''}
      </figcaption>
    </figure>` : ''}
    <section class="verify-panel" data-level="${esc(v.level || 'single')}">
      <div class="verify-panel-top">
        <h3>核验面板</h3>
        <div class="verify-score"><strong>${esc(v.score ?? '—')}</strong><span>可信度评分<br>${esc(v.confidence || '待确认')}</span></div>
      </div>
      <div class="verify-meter" style="--score:${Math.max(0, Math.min(100, Number(v.score) || 0))}%"><i></i></div>
      <div class="verify-grid">
        <div><strong>${esc(v.independentCount ?? 0)}</strong><span>独立信源</span></div>
        <div><strong>${esc(v.independentCountries ?? 0)}</strong><span>独立国家</span></div>
        <div><strong>${esc(v.sourceCount ?? sources.length)}</strong><span>信源总数</span></div>
      </div>
      <p class="verify-note">${esc(v.note || '')}</p>
      ${facts.length ? `<div class="fact-row"><span class="fact-label">共同提及</span>${facts.map((fact) => `<span class="fact-chip">${esc(fact)}</span>`).join('')}</div>` : ''}
    </section>
    <section class="sources-block">
      <div class="sources-block-head"><h3>各信源如何报道</h3><span>${esc(sources.length)} 家 · 按独立性与层级排序</span></div>
      ${sourceCards || '<p class="info-lead">暂无信源明细。</p>'}
    </section>
    <p class="disclaimer">核验说明：本站根据标题、摘要与共同实体/数字做交叉比对，不替代对原文的阅读，也不对事件本身作最终事实裁定。官方机构与国家媒体的表述会单独标注，不计入独立印证。翻译由机器完成，专有名词请以原文为准。</p>`;
  }

  function onModalScroll() {
    const panel = $('.story-panel');
    if (!panel) return;
    const max = panel.scrollHeight - panel.clientHeight;
    setProgress(max > 0 ? panel.scrollTop / max : 0);
  }

  function setProgress(ratio) {
    const el = $('#pageProgress');
    if (el) el.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  function updateReaderScale(delta) {
    state.fontScale = Math.max(0.88, Math.min(1.28, state.fontScale + delta * 0.06));
    const panel = $('.story-panel');
    if (panel) panel.style.setProperty('--reader-scale', state.fontScale.toFixed(2));
  }

  function toggleBookmark(story) {
    const key = bookmarkKey(story);
    if (state.bookmarks[key]) {
      delete state.bookmarks[key];
      toast('已取消收藏。');
    } else {
      state.bookmarks[key] = {
        date: state.edition.date,
        id: story.id,
        title: story.title_zh || story.title_en,
        section: story.section,
        savedAt: new Date().toISOString(),
      };
      toast('已加入收藏。');
    }
    saveBookmarks();
    syncBookmarkButtons();
    updateSavedCount();
  }

  function syncBookmarkButtons() {
    for (const button of $$('[data-bookmark]')) {
      const story = findStory(button.dataset.bookmark);
      if (!story) continue;
      const saved = isSaved(story);
      button.classList.toggle('is-saved', saved);
      button.setAttribute('aria-pressed', String(saved));
      if (button.classList.contains('small-btn')) button.innerHTML = `${icon('bookmark')}${saved ? '已收藏' : '收藏'}`;
    }
  }

  function updateSavedCount() {
    const count = savedCount();
    $('#savedCount').textContent = count;
    $('#savedCountTop').textContent = count;
  }

  async function shareStory(story) {
    const url = `${location.origin}/?date=${encodeURIComponent(state.edition.date)}&story=${encodeURIComponent(story.id)}`;
    const payload = { title: storyTitle(story), text: storySummary(story).slice(0, 120), url };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(url);
      toast('链接已复制到剪贴板。');
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = url;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
        toast('链接已复制到剪贴板。');
      } catch {
        toast('无法自动复制，请从地址栏复制。', true);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Search
   * ------------------------------------------------------------------ */

  function buildSearchIndex(edition) {
    return (edition.stories || []).map((story) => ({
      story,
      title: storyTitle(story),
      titleEn: story.title_en || '',
      summary: storySummary(story),
      entities: (story.entities || []).join(' '),
      tags: (story.tags || []).join(' '),
      section: story.section,
      haystack: [
        story.title_zh, story.title_en, story.summary_zh, story.summary_en,
        ...(story.entities || []), ...(story.tags || []), story.sectionLabel,
      ].join(' ').toLowerCase(),
    }));
  }

  function openSearch() {
    state.lastFocus = document.activeElement;
    showModal('#searchModal');
    renderSearchFilters();
    renderSearchResults();
    setTimeout(() => $('#searchInput')?.focus(), 60);
  }

  function renderSearchFilters() {
    const present = new Set((state.edition?.stories || []).map((s) => s.section));
    const sections = SECTION_ORDER.filter((id) => present.has(id));
    $('#searchFilters').innerHTML = [
      `<button class="filter-chip${state.searchFilter === 'all' ? ' is-active' : ''}" type="button" data-search-filter="all">全部</button>`,
      ...sections.map((id) => `<button class="filter-chip${state.searchFilter === id ? ' is-active' : ''}" type="button" data-search-filter="${esc(id)}">${esc(sectionLabel(id))}</button>`),
    ].join('');
  }

  function renderSearchResults() {
    const query = state.searchQuery.trim().toLowerCase();
    const filter = state.searchFilter;
    let list = state.searchIndex.filter((item) => filter === 'all' || item.section === filter);
    if (query) {
      list = list.map((item) => {
        let score = 0;
        if (item.title.toLowerCase().includes(query)) score += 8;
        if (item.titleEn.toLowerCase().includes(query)) score += 5;
        if (item.summary.toLowerCase().includes(query)) score += 3;
        if (item.entities.toLowerCase().includes(query)) score += 4;
        if (item.tags.toLowerCase().includes(query)) score += 2;
        if (item.haystack.includes(query)) score += 1;
        return { ...item, score };
      }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    } else {
      const order = new Map((state.edition?.brief || []).map((b, i) => [b.id, i]));
      list = [...list].sort((a, b) => (order.get(a.story.id) ?? 99) - (order.get(b.story.id) ?? 99)).slice(0, 8);
    }
    const results = list.slice(0, 20);
    $('#searchCount').textContent = query ? `${list.length} 条结果` : '输入关键词，或从热门实体开始';
    if (!results.length) {
      const entities = (state.edition?.topEntities || []).slice(0, 8);
      $('#searchResults').innerHTML = `<div class="search-empty">
        <p>没有找到“${esc(state.searchQuery)}”。</p>
        ${entities.length ? `<p>试试：${entities.map((entity) => `<button class="filter-chip" type="button" data-search-entity="${esc(entity)}">${esc(entity)}</button>`).join(' ')}</p>` : ''}
      </div>`;
      return;
    }
    $('#searchResults').innerHTML = results.map((item, index) => `<button class="search-result" type="button" data-story="${esc(item.story.id)}">
      <span class="result-num">${esc(pad(index + 1, 2))}</span>
      <span>
        <h4>${highlight(item.title, query)}</h4>
        <p>${highlight(item.summary, query)}</p>
        <span class="result-meta">${esc(sectionLabel(item.section))}<i class="meta-sep"></i>${esc(item.story.verification?.label || '')}<i class="meta-sep"></i>${esc(relativeTime(item.story.publishedAt))}</span>
      </span>
    </button>`).join('');
  }

  function highlight(text, query) {
    const safe = esc(text);
    if (!query) return safe;
    const lower = String(text).toLowerCase();
    const index = lower.indexOf(query);
    if (index < 0) return safe;
    return `${esc(String(text).slice(0, index))}<mark>${esc(String(text).slice(index, index + query.length))}</mark>${esc(String(text).slice(index + query.length))}`;
  }

  /* ------------------------------------------------------------------ *
   * Info / method / sources / install
   * ------------------------------------------------------------------ */

  async function openInfo(mode = 'method') {
    state.lastFocus = document.activeElement;
    state.infoMode = mode;
    if (!state.sourcesData) {
      try {
        state.sourcesData = await getJson('/api/sources');
      } catch {
        state.sourcesData = null;
      }
    }
    const body = $('#infoBody');
    if (mode === 'sources') body.innerHTML = renderSourcesInfo();
    else if (mode === 'install') body.innerHTML = renderInstallInfo();
    else body.innerHTML = renderMethodInfo();
    showModal('#infoModal');
  }

  function renderMethodInfo() {
    const edition = state.edition;
    const stats = edition?.stats || {};
    const classes = new Map();
    for (const story of edition?.stories || []) {
      for (const source of story.sources || []) {
        const key = source.class || 'independent';
        if (!classes.has(key)) classes.set(key, new Set());
        classes.get(key).add(source.id);
      }
    }
    const classLine = [...classes.entries()].map(([key, set]) => `${classLabel(key)} ${set.size}`).join(' · ');
    return `<div class="info-kicker">METHOD / 核验方法</div>
      <h2 id="infoTitle">我们如何把“很多报道”变成“可对照的线索”</h2>
      <p class="info-lead">这不是一个把标题堆在一起的新闻聚合器。每一期都经过同一套流程：采集、去重、按事件聚类、计算独立信源、标注官方口径，再把分歧留在台面上。</p>
      <ol class="info-steps">
        <li><span class="step-num">01</span><div><h4>只取可追溯的信源</h4><p>以通讯社、公共广播、国际大报、专业期刊、国际组织与智库为主。每条都保留原文链接、发布时间与所属机构类型。</p></div></li>
        <li><span class="step-num">02</span><div><h4>按事件归并，而不是按标题归并</h4><p>标题词向量、实体与数字重叠共同决定两条报道是否在讲同一件事。同一 newsroom 的多篇稿件不会被算成多个独立信源。</p></div></li>
        <li><span class="step-num">03</span><div><h4>独立印证优先于“热闹”</h4><p>两家以上不同 newsroom 报道，才进入“交叉印证”。官方机构、国家媒体与智库会单独标注；它们可以是一手材料，但不自动等于独立确认。</p></div></li>
        <li><span class="step-num">04</span><div><h4>把分歧显示出来</h4><p>当标题出现“否认/确认”等相反表述时，条目标记为“表述有分歧”，并保留每家信源的原文摘录，不用一个结论盖过去。</p></div></li>
        <li><span class="step-num">05</span><div><h4>机器辅助，人工可复核</h4><p>聚类、评分、翻译和封面由程序完成；每条判断都能回到信源列表与原文。标题与摘要版权归原信源所有。</p></div></li>
      </ol>
      <div class="info-callout"><strong>本期数据：</strong>${esc(stats.feedsOk ?? '—')} 家信源可用，${esc(stats.articlesUsed ?? '—')} 条报道进入筛选，归并为 ${esc(stats.stories ?? '—')} 条线索，其中 ${esc(stats.verified ?? 0)} 条获得两家以上独立信源交叉印证。${classLine ? `<br><strong>信源构成：</strong>${esc(classLine)}。` : ''}</div>
      <h3>摘要方式</h3>
      <p>${edition?.aiSummary?.status === 'ok'
        ? `本期有 ${esc(edition.aiSummary.summarized)} 条报道使用 AI 综合摘要（${esc(edition.aiSummary.provider)} · ${esc(edition.aiSummary.model || 'model')}）。模型只收到聚类后的 RSS 标题与短摘要，不读取新闻全文；摘要中的事实应回看下方信源原文。`
        : '本期未启用可用的摘要 API，因此使用 RSS 摘要与机器翻译作为降级方案。可以在 .env 配置 OpenAI 兼容 API 或本地 Ollama 后重新生成。'}</p>
      <h3>边界与限制</h3>
      <ul class="info-list">
        <li>抓取的是 RSS/Atom 标题与摘要，不是全文；摘要可能省略关键限定条件。</li>
        <li>“交叉印证”指多家独立 newsroom 报道了同一事件，不代表本站独立核实了事实本身。</li>
        <li>国家媒体与官方机构的材料会保留，用于对照官方立场，但不计入独立印证数量。</li>
        <li>机器翻译可能误译专有名词、数字与语气；引用时请以原文为准。</li>
        <li>时间窗默认为最近 ${esc(edition?.windowHours || 36)} 小时；每日 ${esc(edition?.updateTime || '18:30')}（北京时间）更新。</li>
      </ul>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:22px">
        <button class="btn btn-primary" type="button" data-info-mode="sources">查看全部信源</button>
        <button class="btn btn-ghost" type="button" data-close-info>关闭</button>
      </div>`;
  }

  function renderSourcesInfo() {
    const data = state.sourcesData;
    if (!data) return `<div class="info-kicker">SOURCES / 信源</div><h2 id="infoTitle">信源列表暂不可用</h2><p class="info-lead">本地服务没有返回信源注册表。请稍后重试。</p>`;
    const rows = (data.sources || []).map((source) => {
      const health = source.health || {};
      const status = health.status || 'unfetched';
      const statusLabel = status === 'ok' ? '本期可用' : status === 'stale' ? '内容过旧' : status === 'error' ? '抓取失败' : '未抓取';
      return `<tr>
        <td><b>${esc(source.name)}</b><br><span class="source-country">${esc(source.countryZh || source.country)} · ${esc(source.type)}</span></td>
        <td>${esc(sectionLabel(source.section))}</td>
        <td>${source.independent ? '<span class="tag tag-accent">独立</span>' : `<span class="tag">${esc(classLabel(source.class))}</span>`}</td>
        <td><span class="source-status ${esc(status)}"><i></i>${esc(statusLabel)}</span>${health.latest ? `<br><span class="source-country">${esc(formatDateTime(health.latest))}</span>` : ''}</td>
      </tr>`;
    }).join('');
    const unavailable = (data.unavailable || []).map((source) => `<li><b>${esc(source.name)}</b>：${esc(source.reason || '暂不可用')}（<a href="${esc(safeUrl(source.home))}" target="_blank" rel="noopener noreferrer">官网</a>）</li>`).join('');
    return `<div class="info-kicker">SOURCES / 信源</div>
      <h2 id="infoTitle">${esc(data.sources?.length || 0)} 家信源，分层标注</h2>
      <p class="info-lead">“独立”表示该机构为独立新闻编辑室，可计入交叉印证；官方机构与国家媒体保留用于对照立场，不计入独立印证。状态来自最近一期抓取。</p>
      <div class="source-legend">
        <span><i style="background:var(--green)"></i>本期可用</span>
        <span><i style="background:var(--amber)"></i>内容过旧</span>
        <span><i style="background:var(--red)"></i>抓取失败</span>
        <span><i style="background:var(--faint)"></i>未抓取</span>
      </div>
      <table class="source-table">
        <thead><tr><th>信源</th><th>栏目</th><th>类型</th><th>状态</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${unavailable ? `<h3>暂未纳入自动抓取</h3><ul class="info-list">${unavailable}</ul>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:22px">
        <button class="btn btn-ghost" type="button" data-info-mode="method">返回方法</button>
        <button class="btn btn-ghost" type="button" data-close-info>关闭</button>
      </div>`;
  }

  function renderInstallInfo() {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (standalone) {
      return `<div class="info-kicker">INSTALL / 安装</div><h2 id="infoTitle">已经在独立窗口中运行</h2><p class="info-lead">当前页面已作为应用打开。可以从任务栏或主屏幕直接启动，也可以离线查看最近一期缓存。</p>`;
    }
    return `<div class="info-kicker">INSTALL / 安装</div>
      <h2 id="infoTitle">把晨间简报装到 Windows 和安卓</h2>
      <p class="info-lead">这是一个 PWA：同一个地址，在 Windows 上像桌面应用一样打开，在安卓上可以放到主屏幕。无需应用商店。</p>
      <div class="install-steps">
        <div class="install-step"><strong>Windows · Edge / Chrome</strong><p>打开 <code>${esc(location.origin)}</code>，点击地址栏右侧的“安装”图标，或右键页面选择“安装为应用”。安装后可从开始菜单启动。</p></div>
        <div class="install-step"><strong>Android · Chrome</strong><p>打开同一地址，点右上角菜单，选择“添加到主屏幕 / 安装应用”。如果局域网地址没有 HTTPS，浏览器可能只创建快捷方式；完整 PWA 安装需要 HTTPS 或部署到线上。</p></div>
      </div>
      <div class="info-callout"><strong>局域网访问：</strong>电脑运行服务后，手机连接同一 Wi-Fi，打开启动窗口里打印的 <code>LAN</code> 地址即可。若打不开，请允许 Node.js 通过 Windows 防火墙的专用网络。</div>
      <p style="margin-top:16px"><button class="btn btn-primary" type="button" data-install-now>尝试安装</button> <button class="btn btn-ghost" type="button" data-close-info>关闭</button></p>`;
  }

  /* ------------------------------------------------------------------ *
   * Modal mechanics
   * ------------------------------------------------------------------ */

  function anyModalOpen() {
    return $$('.modal').some((modal) => !modal.hidden);
  }

  function showModal(selector) {
    const modal = $(selector);
    if (!modal) return;
    if (!anyModalOpen()) {
      state.lastFocus = document.activeElement;
      document.body.classList.add('is-locked');
    }
    modal.hidden = false;
    modal.addEventListener('keydown', trapFocus);
  }

  function hideModal(selector) {
    const modal = $(selector);
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.removeEventListener('keydown', trapFocus);
    if (!anyModalOpen()) {
      document.body.classList.remove('is-locked');
      setProgress(0);
      state.lastFocus?.focus?.();
    }
  }

  function closeAllModals() {
    for (const modal of $$('.modal')) {
      if (!modal.hidden) {
        modal.hidden = true;
        modal.removeEventListener('keydown', trapFocus);
      }
    }
    document.body.classList.remove('is-locked');
    setProgress(0);
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const modal = event.currentTarget;
    const focusable = $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', modal)
      .filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ------------------------------------------------------------------ *
   * Navigation / scroll spy
   * ------------------------------------------------------------------ */

  function goToDate(date, { push = true } = {}) {
    if (!date || date === state.currentDate) return;
    state.searchFilter = 'all';
    loadEdition(date, { push });
  }

  function observeView() {
    for (const observer of state.observers) observer.disconnect();
    state.observers = [];
    const revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    for (const el of $$('.reveal')) revealObserver.observe(el);
    state.observers.push(revealObserver);

    const spy = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (!visible.length) return;
      const id = visible[0].target.dataset.section || 'top';
      setActiveNav(id);
    }, { rootMargin: '-15% 0px -70% 0px', threshold: [0, 0.1, 0.3] });
    for (const el of $$('.section-block, #top')) spy.observe(el);
    state.observers.push(spy);
  }

  function setActiveNav(id) {
    for (const link of $$('[data-nav]')) {
      const target = link.closest('.mobile-nav') ? ['top', 'tech', 'economy'].includes(link.dataset.nav) : true;
      link.classList.toggle('is-active', target && link.dataset.nav === id);
    }
  }

  function openDrawer() {
    $('#leftRail').classList.add('is-open');
    $('#drawerBackdrop').hidden = false;
    $('#menuBtn').setAttribute('aria-expanded', 'true');
    $('#mobileMore').setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-locked');
  }

  function closeDrawer() {
    $('#leftRail').classList.remove('is-open');
    $('#drawerBackdrop').hidden = true;
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    $('#mobileMore').setAttribute('aria-expanded', 'false');
    if (!anyModalOpen()) document.body.classList.remove('is-locked');
  }

  /* ------------------------------------------------------------------ *
   * Theme / install / online
   * ------------------------------------------------------------------ */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === 'dark';
    $('#themeBtn').setAttribute('aria-pressed', String(dark));
    $('#themeBtn').setAttribute('aria-label', dark ? '切换浅色模式' : '切换深色模式');
    const meta = document.querySelector('meta[name="theme-color"]:not([media])') || document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0d0f0f' : '#f4f1ea');
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  }

  function setupInstall() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.installPrompt = event;
      for (const id of ['#installBtn', '#installBtnRail', '#installBtnFooter']) {
        const el = $(id);
        if (el) el.hidden = false;
      }
    });
    window.addEventListener('appinstalled', () => {
      state.installPrompt = null;
      for (const id of ['#installBtn', '#installBtnRail', '#installBtnFooter']) {
        const el = $(id);
        if (el) el.hidden = true;
      }
      toast('已安装到设备。');
    });
    if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
      for (const id of ['#installBtn', '#installBtnRail', '#installBtnFooter']) {
        const el = $(id);
        if (el) el.hidden = true;
      }
    }
  }

  async function promptInstall() {
    if (state.installPrompt) {
      state.installPrompt.prompt();
      const choice = await state.installPrompt.userChoice.catch(() => null);
      state.installPrompt = null;
      if (choice?.outcome === 'accepted') toast('正在安装…');
      return;
    }
    openInfo('install');
  }

  function setupOnline() {
    window.addEventListener('online', () => {
      state.offline = false;
      showOffline(false);
      loadStatus();
      toast('网络已恢复。');
    });
    window.addEventListener('offline', () => {
      state.offline = true;
      showOffline(true);
      updateStatusUI();
    });
    if (state.offline) showOffline(true);
  }

  function showOffline(show) {
    const banner = $('#offlineBanner');
    if (banner) banner.hidden = !show;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!secure) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline install is optional */ });
  }

  /* ------------------------------------------------------------------ *
   * Event wiring
   * ------------------------------------------------------------------ */

  function wireEvents() {
    $('#themeBtn')?.addEventListener('click', toggleTheme);
    $('#searchBtn')?.addEventListener('click', openSearch);
    $('#mobileSearch')?.addEventListener('click', openSearch);
    $('#refreshBtn')?.addEventListener('click', triggerRefresh);
    $('#statusRefresh')?.addEventListener('click', triggerRefresh);
    $('#emptyRefresh')?.addEventListener('click', triggerRefresh);
    $('#emptyMethod')?.addEventListener('click', () => openInfo('method'));

    for (const id of ['#methodBtnTop', '#methodBtn', '#methodBtnRail', '#methodBtnFooter', '#openMethodFromRail']) {
      $(id)?.addEventListener('click', () => openInfo('method'));
    }
    $('#sourcesBtnFooter')?.addEventListener('click', () => openInfo('sources'));
    for (const id of ['#installBtn', '#installBtnRail', '#installBtnFooter']) {
      $(id)?.addEventListener('click', promptInstall);
    }
    $('#savedBtn')?.addEventListener('click', openSaved);
    $('#savedBtnTop')?.addEventListener('click', openSaved);
    $('#menuBtn')?.addEventListener('click', openDrawer);
    $('#mobileMore')?.addEventListener('click', openDrawer);
    $('#drawerBackdrop')?.addEventListener('click', closeDrawer);
    $('#leftRail')?.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeDrawer();
    });
    $('#todayBtn')?.addEventListener('click', () => {
      if (state.editions[0]?.date) goToDate(state.editions[0].date);
    });
    $('#prevDate')?.addEventListener('click', () => {
      const dates = state.editions.map((e) => e.date);
      const index = dates.indexOf(state.currentDate);
      if (index >= 0 && dates[index + 1]) goToDate(dates[index + 1]);
    });
    $('#nextDate')?.addEventListener('click', () => {
      const dates = state.editions.map((e) => e.date);
      const index = dates.indexOf(state.currentDate);
      if (index > 0) goToDate(dates[index - 1]);
    });
    $('#archiveSelect')?.addEventListener('change', (event) => goToDate(event.target.value));

    window.addEventListener('popstate', () => {
      const date = new URLSearchParams(location.search).get('date');
      loadEdition(date || null, { silent: true });
    });

    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeydown);
    document.addEventListener('error', (event) => {
      const image = event.target;
      if (image?.matches?.('[data-article-image]')) {
        const figure = image.closest('.story-image');
        if (figure) figure.hidden = true;
      }
    }, true);
    window.addEventListener('scroll', onPageScroll, { passive: true });

    $('#searchInput')?.addEventListener('input', (event) => {
      state.searchQuery = event.target.value;
      renderSearchResults();
    });
    $('#searchModal')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        const first = $('#searchResults [data-story]');
        if (first) {
          event.preventDefault();
          const id = first.dataset.story;
          hideModal('#searchModal');
          openStory(id);
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        hideModal('#searchModal');
      }
    });
    $('#searchFilters')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-search-filter]');
      if (!button) return;
      state.searchFilter = button.dataset.searchFilter;
      renderSearchFilters();
      renderSearchResults();
    });

    for (const modal of $$('.modal')) {
      modal.addEventListener('click', (event) => {
        if (event.target.closest('[data-close-modal]')) hideModal('#storyModal');
        if (event.target.closest('[data-close-search]')) hideModal('#searchModal');
        if (event.target.closest('[data-close-info]')) hideModal('#infoModal');
      });
    }
    $('#infoBody')?.addEventListener('click', (event) => {
      const mode = event.target.closest('[data-info-mode]');
      if (mode) openInfo(mode.dataset.infoMode);
      if (event.target.closest('[data-install-now]')) promptInstall();
    });
  }

  function onDocumentClick(event) {
    const bookmark = event.target.closest('[data-bookmark]');
    if (bookmark) {
      event.preventDefault();
      event.stopPropagation();
      const story = findStory(bookmark.dataset.bookmark);
      if (story) toggleBookmark(story);
      return;
    }
    const share = event.target.closest('[data-share-story]');
    if (share) {
      event.preventDefault();
      const story = findStory(share.dataset.shareStory);
      if (story) shareStory(story);
      return;
    }
    const font = event.target.closest('[data-font]');
    if (font) {
      event.preventDefault();
      updateReaderScale(Number(font.dataset.font));
      return;
    }
    const closeStory = event.target.closest('[data-close-modal]');
    if (closeStory) {
      hideModal('#storyModal');
      return;
    }
    const searchEntity = event.target.closest('[data-search-entity]');
    if (searchEntity) {
      state.searchQuery = searchEntity.dataset.searchEntity;
      $('#searchInput').value = state.searchQuery;
      renderSearchResults();
      return;
    }
    const storyEl = event.target.closest('[data-story]');
    if (storyEl && !event.target.closest('a')) {
      if (event.target.closest('.bookmark-btn')) return;
      if ($('#searchModal') && !$('#searchModal').hidden) hideModal('#searchModal');
      if ($('#leftRail')?.classList.contains('is-open')) closeDrawer();
      openStory(storyEl.dataset.story);
    }
  }

  function onDocumentKeydown(event) {
    const tag = event.target?.tagName?.toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || event.target?.isContentEditable;
    if (event.key === 'Escape') {
      if (anyModalOpen()) {
        if (!$('#storyModal').hidden) hideModal('#storyModal');
        else if (!$('#searchModal').hidden) hideModal('#searchModal');
        else if (!$('#infoModal').hidden) hideModal('#infoModal');
      } else if ($('#leftRail')?.classList.contains('is-open')) {
        closeDrawer();
      }
      return;
    }
    if (event.key === '/' && !typing && !anyModalOpen()) {
      event.preventDefault();
      openSearch();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && !typing) {
      const el = event.target.closest('[data-story][role="button"]');
      if (el) {
        event.preventDefault();
        openStory(el.dataset.story);
      }
    }
  }

  function onPageScroll() {
    if (anyModalOpen()) return;
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    setProgress(max > 0 ? doc.scrollTop / max : 0);
  }

  function openSaved() {
    const items = Object.values(state.bookmarks)
      .filter((item) => item && item.id && item.date)
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    const body = $('#infoBody');
    body.innerHTML = `<div class="info-kicker">SAVED / 我的收藏</div>
      <h2 id="infoTitle">稍后阅读</h2>
      <p class="info-lead">${items.length ? `共 ${items.length} 条收藏，保存在这台设备上。` : '还没有收藏。打开任意报道，点书签图标即可保存。'}</p>
      ${items.length ? `<ol class="compact-list" style="margin-top:14px">${items.map((item, index) => `<li><button type="button" data-saved-date="${esc(item.date)}" data-saved-id="${esc(item.id)}">
        <span class="num">${esc(pad(index + 1, 2))}</span>
        <span class="compact-body"><h4>${esc(item.title)}</h4><span class="compact-meta">${esc(item.date)} · ${esc(sectionLabel(item.section))}</span></span>
      </button></li>`).join('')}</ol>` : ''}
      ${items.length ? '<p style="margin-top:18px"><button class="btn btn-ghost" type="button" data-clear-bookmarks>清空收藏</button></p>' : ''}
      <p style="margin-top:20px"><button class="btn btn-ghost" type="button" data-close-info>关闭</button></p>`;
    showModal('#infoModal');
    body.querySelectorAll('[data-saved-date]').forEach((button) => {
      button.addEventListener('click', async () => {
        const date = button.dataset.savedDate;
        const id = button.dataset.savedId;
        hideModal('#infoModal');
        if (date !== state.currentDate) await loadEdition(date, { silent: true });
        setTimeout(() => openStory(id), 80);
      });
    });
    body.querySelector('[data-clear-bookmarks]')?.addEventListener('click', () => {
      state.bookmarks = {};
      saveBookmarks();
      updateSavedCount();
      syncBookmarkButtons();
      hideModal('#infoModal');
      toast('收藏已清空。');
    });
  }

  function updateSavedUIOnLoad() {
    updateSavedCount();
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  async function boot() {
    wireEvents();
    setupInstall();
    setupOnline();
    const themeParam = new URLSearchParams(location.search).get('theme');
    if (themeParam === 'dark' || themeParam === 'light') {
      applyTheme(themeParam);
      try { localStorage.setItem(THEME_KEY, themeParam); } catch { /* ignore */ }
    } else {
      applyTheme(currentTheme());
    }
    startCountdown();
    updateSavedUIOnLoad();
    registerServiceWorker();

    await Promise.allSettled([loadStatus(), loadEditions()]);
    const params = new URLSearchParams(location.search);
    const date = params.get('date');
    const hashStory = location.hash.startsWith('#story-') ? decodeURIComponent(location.hash.slice(7)) : '';
    const storyId = params.get('story') || hashStory;
    if (storyId) {
      await loadEdition(date || null, { silent: true });
      if (state.edition) openStory(storyId);
    } else {
      await loadEdition(date || null);
    }
    if (location.hash.startsWith('#section-')) {
      const target = document.getElementById(location.hash.slice(1));
      setTimeout(() => target?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
    const info = params.get('info');
    if (info === 'method' || info === 'sources' || info === 'install') openInfo(info);
    const q = params.get('q');
    if (q && state.edition) {
      openSearch();
      state.searchQuery = q;
      $('#searchInput').value = q;
      renderSearchResults();
    }
    if (!state.edition && !state.offline) startEmptyPoll();
    // Refresh status once the first edition is on screen.
    loadStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
