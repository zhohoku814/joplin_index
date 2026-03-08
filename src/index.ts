import joplin from '../api';
import { MenuItemLocation, SettingItemType, ToastType, ToolbarButtonLocation } from '../api/types';

const uslug = require('@joplin/fork-uslug');

const START_MARKER = '<!-- rich-toc-top:start -->';
const END_MARKER = '<!-- rich-toc-top:end -->';
const TOC_TITLE = '## 目录';
const PANEL_ID = 'richTocTop.panel';
const SETTINGS_SECTION = 'richTocTop';
const SETTING_DISPLAY_MODE = 'displayMode';

type DisplayMode = 'all' | 'top' | '12';

interface HeaderItem {
	level: number;
	text: string;
	slug: string;
}

function normaliseNewlines(text: string): string {
	return (text || '').replace(/\r\n/g, '\n');
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function stripGeneratedToc(body: string): string {
	const normalised = normaliseNewlines(body);
	const pattern = new RegExp(`${escapeRegex(START_MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}\\n*`, 'g');
	return normalised.replace(pattern, '').replace(/^\s+/, '').replace(/\n{3,}/g, '\n\n');
}

function cleanHeaderText(text: string): string {
	return text
		.replace(/`([^`]+)`/g, '$1')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[*_~]/g, '')
		.trim();
}

function extractHeaders(noteBody: string): HeaderItem[] {
	const body = normaliseNewlines(noteBody);
	const lines = body.split('\n');
	const headers: HeaderItem[] = [];
	const slugCounts: Record<string, number> = {};
	let inFence = false;

	for (const line of lines) {
		if (/^```/.test(line.trim())) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;

		const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
		if (!match) continue;

		const text = cleanHeaderText(match[2].trim());
		if (!text || text === '目录') continue;

		const baseSlug = uslug(text);
		if (!baseSlug) continue;

		const count = slugCounts[baseSlug] || 0;
		slugCounts[baseSlug] = count + 1;
		const slug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;

		headers.push({
			level: match[1].length,
			text,
			slug,
		});
	}

	return headers;
}

function sanitiseDisplayMode(value: unknown): DisplayMode {
	return value === 'top' || value === '12' || value === 'all' ? value : 'all';
}

function getBaseLevel(headers: HeaderItem[]): number {
	if (!headers.length) return 1;
	return Math.min(...headers.map(header => header.level));
}

function filterHeaders(headers: HeaderItem[], displayMode: DisplayMode): HeaderItem[] {
	if (!headers.length || displayMode === 'all') return headers;

	const baseLevel = getBaseLevel(headers);
	if (displayMode === 'top') {
		return headers.filter(header => header.level === baseLevel);
	}

	return headers.filter(header => header.level <= baseLevel + 1);
}

function displayModeLabel(displayMode: DisplayMode): string {
	switch (displayMode) {
		case 'top':
			return '仅顶级目录';
		case '12':
			return '仅前 1-2 级';
		default:
			return '全部层级';
	}
}

function buildTocMarkdown(headers: HeaderItem[]): string {
	const baseLevel = getBaseLevel(headers);
	const lines = headers.map(header => {
		const indent = '  '.repeat(Math.max(0, header.level - baseLevel));
		return `${indent}- [${header.text}](#${header.slug})`;
	});

	return [START_MARKER, TOC_TITLE, '', ...lines, '', END_MARKER, ''].join('\n');
}

function buildFilterControlsHtml(displayMode: DisplayMode): string {
	return `
		<div class="filter-group">
			<div class="filter-title">显示范围</div>
			<label class="filter-option">
				<input type="checkbox" data-display-mode="top" ${displayMode === 'top' ? 'checked' : ''} />
				<span>只显示顶级目录</span>
			</label>
			<label class="filter-option">
				<input type="checkbox" data-display-mode="12" ${displayMode === '12' ? 'checked' : ''} />
				<span>仅显示 1-2 级</span>
			</label>
			<button class="filter-reset-btn" data-action="setDisplayModeAll" ${displayMode === 'all' ? 'disabled' : ''}>显示全部</button>
		</div>
	`;
}

function buildPanelHtml(noteTitle: string, headers: HeaderItem[], displayMode: DisplayMode): string {
	const filteredHeaders = filterHeaders(headers, displayMode);
	const baseLevel = getBaseLevel(filteredHeaders.length ? filteredHeaders : headers);
	const filterControls = buildFilterControlsHtml(displayMode);

	let contentHtml = '';
	if (!headers.length) {
		contentHtml = `
			<div class="empty-state">
				<p>这篇笔记里还没有可用标题。</p>
				<p class="hint">先在富文本里用“标题 1 / 标题 2 / 标题 3”，再点顶部目录按钮。</p>
			</div>
		`;
	} else if (!filteredHeaders.length) {
		contentHtml = `
			<div class="empty-state">
				<p>当前筛选下没有匹配标题。</p>
				<p class="hint">现在是“${escapeHtml(displayModeLabel(displayMode))}”视图，可以点“显示全部”恢复。</p>
			</div>
		`;
	} else {
		const items = filteredHeaders.map(header => {
			const indent = Math.max(0, header.level - baseLevel) * 14;
			return `
				<button class="toc-item-link" data-slug="${escapeHtml(header.slug)}" style="padding-left:${indent + 10}px">
					<span class="bullet">•</span>
					<span class="label">${escapeHtml(header.text)}</span>
				</button>
			`;
		});

		contentHtml = `
			<div class="toc-meta">显示 ${filteredHeaders.length} / ${headers.length} 个标题 · ${escapeHtml(displayModeLabel(displayMode))}</div>
			<div class="toc-list">
				${items.join('\n')}
			</div>
		`;
	}

	return `
		<div class="container">
			<div class="panel-header">
				<div class="panel-title">目录</div>
				<div class="panel-note-title" title="${escapeHtml(noteTitle || '')}">${escapeHtml(noteTitle || '当前笔记')}</div>
			</div>
			<div class="panel-actions">
				<button class="action-btn" data-action="generateTopToc">刷新顶部目录</button>
				${filterControls}
			</div>
			<div class="panel-content">
				${contentHtml}
			</div>
		</div>
	`;
}

async function showToast(message: string) {
	await joplin.views.dialogs.showToast({
		message,
		type: ToastType.Info,
	});
}

async function getDisplayMode(): Promise<DisplayMode> {
	const value = await joplin.settings.value(SETTING_DISPLAY_MODE);
	return sanitiseDisplayMode(value);
}

async function setDisplayMode(displayMode: DisplayMode) {
	await joplin.settings.setValue(SETTING_DISPLAY_MODE, displayMode);
}

async function generateTocAtTop() {
	const note = await joplin.workspace.selectedNote();
	if (!note) {
		await showToast('没有选中的笔记');
		return false;
	}

	const body = normaliseNewlines(note.body || '');
	const bodyWithoutOldToc = stripGeneratedToc(body);
	const headers = extractHeaders(bodyWithoutOldToc);

	if (!headers.length) {
		await showToast('没找到标题。请先在富文本里用“标题 1/2/3”再生成目录。');
		return false;
	}

	const displayMode = await getDisplayMode();
	const filteredHeaders = filterHeaders(headers, displayMode);
	if (!filteredHeaders.length) {
		await showToast(`当前筛选“${displayModeLabel(displayMode)}”下没有可生成的目录项`);
		return false;
	}

	const toc = buildTocMarkdown(filteredHeaders);
	const nextBody = `${toc}\n${bodyWithoutOldToc}`.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');

	await joplin.data.put(['notes', note.id], null, { body: nextBody });
	const summary = filteredHeaders.length === headers.length
		? `${filteredHeaders.length} 个标题`
		: `${filteredHeaders.length}/${headers.length} 个标题（${displayModeLabel(displayMode)}）`;
	await showToast(`顶部目录已生成：${summary}`);
	return true;
}

async function removeGeneratedToc() {
	const note = await joplin.workspace.selectedNote();
	if (!note) {
		await showToast('没有选中的笔记');
		return false;
	}

	const body = normaliseNewlines(note.body || '');
	const nextBody = stripGeneratedToc(body);
	if (nextBody === body) {
		await showToast('这篇笔记里没有插件生成的顶部目录');
		return false;
	}

	await joplin.data.put(['notes', note.id], null, { body: nextBody });
	await showToast('已移除顶部目录');
	return true;
}

joplin.plugins.register({
	onStart: async function() {
		await joplin.settings.registerSection(SETTINGS_SECTION, {
			label: 'Rich TOC Top',
			iconName: 'fas fa-list-ul',
		});

		await joplin.settings.registerSettings({
			[SETTING_DISPLAY_MODE]: {
				value: 'all',
				type: SettingItemType.String,
				label: '目录显示范围',
				public: false,
				section: SETTINGS_SECTION,
			},
		});

		const panel = await joplin.views.panels.create(PANEL_ID);
		await joplin.views.panels.addScript(panel, './webview.css');
		await joplin.views.panels.addScript(panel, './webview.js');

		const updatePanel = async () => {
			const displayMode = await getDisplayMode();
			const note = await joplin.workspace.selectedNote();
			if (!note) {
				await joplin.views.panels.setHtml(panel, buildPanelHtml('当前笔记', [], displayMode));
				return;
			}

			const bodyWithoutOldToc = stripGeneratedToc(note.body || '');
			const headers = extractHeaders(bodyWithoutOldToc);
			await joplin.views.panels.setHtml(panel, buildPanelHtml(note.title || '当前笔记', headers, displayMode));
		};

		await joplin.views.panels.onMessage(panel, async (message: any) => {
			if (message.name === 'scrollToHash' && message.hash) {
				await joplin.commands.execute('scrollToHash', message.hash);
				return;
			}

			if (message.name === 'generateTopToc') {
				await generateTocAtTop();
				await updatePanel();
				return;
			}

			if (message.name === 'setDisplayMode') {
				await setDisplayMode(sanitiseDisplayMode(message.mode));
				await updatePanel();
			}
		});

		await joplin.commands.register({
			name: 'richTocTop.generate',
			label: '生成/刷新顶部目录',
			iconName: 'fas fa-list-ul',
			execute: async () => {
				await generateTocAtTop();
				await updatePanel();
			},
		});

		await joplin.commands.register({
			name: 'richTocTop.remove',
			label: '移除顶部目录',
			iconName: 'fas fa-list-alt',
			execute: async () => {
				await removeGeneratedToc();
				await updatePanel();
			},
		});

		await joplin.commands.register({
			name: 'richTocTop.togglePanel',
			label: '显示/隐藏侧边目录',
			iconName: 'fas fa-map-signs',
			execute: async () => {
				const isVisible = await joplin.views.panels.visible(panel);
				await joplin.views.panels.show(panel, !isVisible);
			},
		});

		await joplin.views.toolbarButtons.create('richTocTopGenerateButton', 'richTocTop.generate', ToolbarButtonLocation.EditorToolbar);
		await joplin.views.toolbarButtons.create('richTocTopTogglePanelButton', 'richTocTop.togglePanel', ToolbarButtonLocation.NoteToolbar);
		await joplin.views.menuItems.create('richTocTopGenerateMenu', 'richTocTop.generate', MenuItemLocation.Tools);
		await joplin.views.menuItems.create('richTocTopRemoveMenu', 'richTocTop.remove', MenuItemLocation.Tools);
		await joplin.views.menuItems.create('richTocTopTogglePanelMenu', 'richTocTop.togglePanel', MenuItemLocation.Tools);

		await joplin.workspace.onNoteSelectionChange(async () => {
			await updatePanel();
		});

		await joplin.workspace.onNoteChange(async () => {
			await updatePanel();
		});

		await joplin.settings.onChange(async () => {
			await updatePanel();
		});

		await updatePanel();
		await joplin.views.panels.show(panel, true);
	},
});
