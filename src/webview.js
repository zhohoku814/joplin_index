document.addEventListener('click', event => {
	const element = event.target.closest('[data-slug], [data-action]');
	if (!element) return;

	if (element.dataset.slug) {
		webviewApi.postMessage({
			name: 'scrollToHash',
			hash: element.dataset.slug,
		});
		return;
	}

	if (element.dataset.action === 'generateTopToc') {
		webviewApi.postMessage({
			name: 'generateTopToc',
		});
		return;
	}

	if (element.dataset.action === 'setDisplayModeAll') {
		webviewApi.postMessage({
			name: 'setDisplayMode',
			mode: 'all',
		});
	}
});

document.addEventListener('change', event => {
	const input = event.target.closest('input[data-display-mode]');
	if (!input) return;

	webviewApi.postMessage({
		name: 'setDisplayMode',
		mode: input.checked ? input.dataset.displayMode : 'all',
	});
});
