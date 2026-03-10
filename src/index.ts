import joplin from '../api';
import { MenuItemLocation, SettingItemType, ToastType, ToolbarButtonLocation } from '../api/types';

const uslug = require('@joplin/fork-uslug');

const START_MARKER = '<!-- rich-toc-top:start -->';
const END_MARKER = '<!-- rich-toc-top:end -->';
const PANEL_ID = 'richTocTop.panel';
const SETTINGS_SECTION = 'richTocTop';
const SETTING_DISPLAY_MODE = 'displayMode';
const SETTING_UI_LANGUAGE = 'uiLanguage';

type DisplayMode = 'all' | 'top' | '12';
type UiLanguageSetting = 'auto' | 'zh-CN' | 'en';
type UiLocale = 'zh-CN' | 'en';

interface HeaderItem {
	level: number;
	text: string;
	slug: string;
}

const MESSAGES: Record<UiLocale, Record<string, string>> = {
	'zh-CN': {
		'markdown.tocTitle': '## 目录',
		'panel.title': '目录',
		'panel.currentNote': '当前笔记',
		'panel.refreshTopToc': '刷新顶部目录',
		'panel.filterTitle': '显示范围',
		'panel.filter.topOnly': '只显示顶级目录',
		'panel.filter.level12': '仅显示 1-2 级',
		'panel.filter.showAll': '显示全部',
		'panel.empty.noHeaders': '这篇笔记里还没有可用标题。',
		'panel.empty.hint': '先在富文本里用“标题 1 / 标题 2 / 标题 3”，再点顶部目录按钮。',
		'panel.empty.noFiltered': '当前筛选下没有匹配标题。',
		'panel.empty.noFilteredHint': '现在是“{{mode}}”视图，可以点“显示全部”恢复。',
		'panel.meta': '显示 {{shown}} / {{total}} 个标题 · {{mode}}',
		'mode.top': '仅顶级目录',
		'mode.12': '仅前 1-2 级',
		'mode.all': '全部层级',
		'toast.noSelectedNote': '没有选中的笔记',
		'toast.noHeadersFound': '没找到标题。请先在富文本里用“标题 1/2/3”再生成目录。',
		'toast.noItemsInFilter': '当前筛选“{{mode}}”下没有可生成的目录项',
		'toast.generatedAll': '{{count}} 个标题',
		'toast.generatedPartial': '{{shown}}/{{total}} 个标题（{{mode}}）',
		'toast.generated': '顶部目录已生成：{{summary}}',
		'toast.noGeneratedToc': '这篇笔记里没有插件生成的顶部目录',
		'toast.removed': '已移除顶部目录',
		'command.generate': '生成/刷新顶部目录',
		'command.remove': '移除顶部目录',
		'command.togglePanel': '显示/隐藏侧边目录',
		'settings.sectionLabel': 'Rich TOC Top / 顶部目录增强',
		'settings.displayModeLabel': '目录显示范围',
		'settings.languageLabel': 'Language / 语言',
		'settings.languageDescription': 'Auto follows Joplin locale. 自动跟随 Joplin 应用语言。',
		'settings.language.auto': 'Auto / 自动',
		'settings.language.zh-CN': '简体中文',
		'settings.language.en': 'English',
	},
	en: {
		'markdown.tocTitle': '## Table of Contents',
		'panel.title': 'Outline',
		'panel.currentNote': 'Current note',
		'panel.refreshTopToc': 'Refresh top TOC',
		'panel.filterTitle': 'Display range',
		'panel.filter.topOnly': 'Top-level headings only',
		'panel.filter.level12': 'Levels 1-2 only',
		'panel.filter.showAll': 'Show all',
		'panel.empty.noHeaders': 'No headings were found in this note yet.',
		'panel.empty.hint': 'Use Heading 1 / Heading 2 / Heading 3 in rich-text mode, then click the top TOC button.',
		'panel.empty.noFiltered': 'No headings match the current filter.',
		'panel.empty.noFilteredHint': 'Current view: “{{mode}}”. Click “Show all” to restore.',
		'panel.meta': 'Showing {{shown}} / {{total}} headings · {{mode}}',
		'mode.top': 'Top-level only',
		'mode.12': 'Levels 1-2 only',
		'mode.all': 'All levels',
		'toast.noSelectedNote': 'No note is selected',
		'toast.noHeadersFound': 'No headings found. Please add Heading 1/2/3 first, then generate the TOC.',
		'toast.noItemsInFilter': 'No TOC items can be generated under the “{{mode}}” filter',
		'toast.generatedAll': '{{count}} headings',
		'toast.generatedPartial': '{{shown}}/{{total}} headings ({{mode}})',
		'toast.generated': 'Top TOC generated: {{summary}}',
		'toast.noGeneratedToc': 'This note does not contain a plugin-generated top TOC',
		'toast.removed': 'Top TOC removed',
		'command.generate': 'Generate/Refresh Top TOC',
		'command.remove': 'Remove Top TOC',
		'command.togglePanel': 'Show/Hide Sidebar Outline',
		'settings.sectionLabel': 'Rich TOC Top',
		'settings.displayModeLabel': 'TOC display range',
		'settings.languageLabel': 'Language / 语言',
		'settings.languageDescription': 'Auto follows Joplin locale. 自动跟随 Joplin 应用语言。',
		'settings.language.auto': 'Auto / 自动',
		'settings.language.zh-CN': '简体中文',
		'settings.language.en': 'English',
	},
};

let uiLocale: UiLocale = 'zh-CN';
let uiLanguageSetting: UiLanguageSetting = 'auto';

function t(key: string, vars?: Record<string, any>): string {
	const dict = MESSAGES[uiLocale] || MESSAGES['zh-CN'];
	const fallback = MESSAGES['zh-CN'];
	const template = dict[key] || fallback[key] || key;
	return String(template).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, varName) => {
		if (!vars || !Object.prototype.hasOwnProperty.call(vars, varName)) return '';
		return String(vars[varName]);
	});
}

function resolveLocale(setting: UiLanguageSetting, detected: string): UiLocale {
	if (setting === 'zh-CN' || setting === 'en') return setting;
	return String(detected || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

async function detectAppLocale(): Promise<string> {
	try {
		const locale = await joplin.settings.globalValue('locale');
		if (locale) return String(locale);
	} catch (_error) {
		// Ignore and fallback.
	}
	return Intl.DateTimeFormat().resolvedOptions().locale || 'en';
}

async function reloadUi() {
	uiLanguageSetting = (await joplin.settings.value(SETTING_UI_LANGUAGE) || 'auto') as UiLanguageSetting;
	uiLocale = resolveLocale(uiLanguageSetting, await detectAppLocale());
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

function isGeneratedTocHeading(text: string): boolean {
	const normalized = String(text || '').trim().toLowerCase();
	if (!normalized) return false;
	if (normalized === '目录') return true;
	if (normalized === 'table of contents') return true;
	return false;
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
		if (!text || isGeneratedTocHeading(text)) continue;

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
			return t('mode.top');
		case '12':
			return t('mode.12');
		default:
			return t('mode.all');
	}
}

function buildTocMarkdown(headers: HeaderItem[]): string {
	const baseLevel = getBaseLevel(headers);
	const lines = headers.map(header => {
		const indent = '  '.repeat(Math.max(0, header.level - baseLevel));
		return `${indent}- [${header.text}](#${header.slug})`;
	});

	return [START_MARKER, t('markdown.tocTitle'), '', ...lines, '', END_MARKER, ''].join('\n');
}

function buildFilterControlsHtml(displayMode: DisplayMode): string {
	return `
		<div class="filter-group">
			<div class="filter-title">${escapeHtml(t('panel.filterTitle'))}</div>
			<label class="filter-option">
				<input type="checkbox" data-display-mode="top" ${displayMode === 'top' ? 'checked' : ''} />
				<span>${escapeHtml(t('panel.filter.topOnly'))}</span>
			</label>
			<label class="filter-option">
				<input type="checkbox" data-display-mode="12" ${displayMode === '12' ? 'checked' : ''} />
				<span>${escapeHtml(t('panel.filter.level12'))}</span>
			</label>
			<button class="filter-reset-btn" data-action="setDisplayModeAll" ${displayMode === 'all' ? 'disabled' : ''}>${escapeHtml(t('panel.filter.showAll'))}</button>
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
				<p>${escapeHtml(t('panel.empty.noHeaders'))}</p>
				<p class="hint">${escapeHtml(t('panel.empty.hint'))}</p>
			</div>
		`;
	} else if (!filteredHeaders.length) {
		contentHtml = `
			<div class="empty-state">
				<p>${escapeHtml(t('panel.empty.noFiltered'))}</p>
				<p class="hint">${escapeHtml(t('panel.empty.noFilteredHint', { mode: displayModeLabel(displayMode) }))}</p>
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
			<div class="toc-meta">${escapeHtml(t('panel.meta', { shown: filteredHeaders.length, total: headers.length, mode: displayModeLabel(displayMode) }))}</div>
			<div class="toc-list">
				${items.join('\n')}
			</div>
		`;
	}

	return `
		<div class="container">
			<div class="panel-header">
				<div class="panel-title">${escapeHtml(t('panel.title'))}</div>
				<div class="panel-note-title" title="${escapeHtml(noteTitle || '')}">${escapeHtml(noteTitle || t('panel.currentNote'))}</div>
			</div>
			<div class="panel-actions">
				<button class="action-btn" data-action="generateTopToc">${escapeHtml(t('panel.refreshTopToc'))}</button>
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
		await showToast(t('toast.noSelectedNote'));
		return false;
	}

	const body = normaliseNewlines(note.body || '');
	const bodyWithoutOldToc = stripGeneratedToc(body);
	const headers = extractHeaders(bodyWithoutOldToc);

	if (!headers.length) {
		await showToast(t('toast.noHeadersFound'));
		return false;
	}

	const displayMode = await getDisplayMode();
	const filteredHeaders = filterHeaders(headers, displayMode);
	if (!filteredHeaders.length) {
		await showToast(t('toast.noItemsInFilter', { mode: displayModeLabel(displayMode) }));
		return false;
	}

	const toc = buildTocMarkdown(filteredHeaders);
	const nextBody = `${toc}\n${bodyWithoutOldToc}`.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');

	await joplin.data.put(['notes', note.id], null, { body: nextBody });
	const summary = filteredHeaders.length === headers.length
		? t('toast.generatedAll', { count: filteredHeaders.length })
		: t('toast.generatedPartial', { shown: filteredHeaders.length, total: headers.length, mode: displayModeLabel(displayMode) });
	await showToast(t('toast.generated', { summary }));
	return true;
}

async function removeGeneratedToc() {
	const note = await joplin.workspace.selectedNote();
	if (!note) {
		await showToast(t('toast.noSelectedNote'));
		return false;
	}

	const body = normaliseNewlines(note.body || '');
	const nextBody = stripGeneratedToc(body);
	if (nextBody === body) {
		await showToast(t('toast.noGeneratedToc'));
		return false;
	}

	await joplin.data.put(['notes', note.id], null, { body: nextBody });
	await showToast(t('toast.removed'));
	return true;
}

joplin.plugins.register({
	onStart: async function() {
		uiLocale = resolveLocale('auto', await detectAppLocale());

		await joplin.settings.registerSection(SETTINGS_SECTION, {
			label: t('settings.sectionLabel'),
			iconName: 'fas fa-list-ul',
		});

		await joplin.settings.registerSettings({
			[SETTING_DISPLAY_MODE]: {
				value: 'all',
				type: SettingItemType.String,
				label: t('settings.displayModeLabel'),
				public: false,
				section: SETTINGS_SECTION,
			},
			[SETTING_UI_LANGUAGE]: {
				value: 'auto',
				type: SettingItemType.String,
				public: true,
				isEnum: true,
				section: SETTINGS_SECTION,
				label: t('settings.languageLabel'),
				description: t('settings.languageDescription'),
				options: {
					auto: t('settings.language.auto'),
					'zh-CN': t('settings.language.zh-CN'),
					en: t('settings.language.en'),
				},
			},
		});

		await reloadUi();

		const panel = await joplin.views.panels.create(PANEL_ID);
		await joplin.views.panels.addScript(panel, './webview.css');
		await joplin.views.panels.addScript(panel, './webview.js');

		const updatePanel = async () => {
			const displayMode = await getDisplayMode();
			const note = await joplin.workspace.selectedNote();
			if (!note) {
				await joplin.views.panels.setHtml(panel, buildPanelHtml(t('panel.currentNote'), [], displayMode));
				return;
			}

			const bodyWithoutOldToc = stripGeneratedToc(note.body || '');
			const headers = extractHeaders(bodyWithoutOldToc);
			await joplin.views.panels.setHtml(panel, buildPanelHtml(note.title || t('panel.currentNote'), headers, displayMode));
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
			label: t('command.generate'),
			iconName: 'fas fa-list-ul',
			execute: async () => {
				await generateTocAtTop();
				await updatePanel();
			},
		});

		await joplin.commands.register({
			name: 'richTocTop.remove',
			label: t('command.remove'),
			iconName: 'fas fa-list-alt',
			execute: async () => {
				await removeGeneratedToc();
				await updatePanel();
			},
		});

		await joplin.commands.register({
			name: 'richTocTop.togglePanel',
			label: t('command.togglePanel'),
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
			await reloadUi();
			await updatePanel();
		});

		await updatePanel();
		await joplin.views.panels.show(panel, true);
	},
});
