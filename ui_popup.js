(function () {
    const state = {
        ready: false,
        overlay: null,
        popup: null,
        titleEl: null,
        messageEl: null,
        inputEl: null,
        okBtn: null,
        cancelBtn: null,
        resolve: null,
        open: false,
        type: 'alert'
    };

    function ensurePopup() {
        if (state.ready) return;
        state.ready = true;

        const overlay = document.createElement('div');
        overlay.id = 'ui-popup-overlay';
        overlay.innerHTML = [
            '<div id="ui-popup" role="dialog" aria-modal="true">',
            '  <div id="ui-popup-title">Notice</div>',
            '  <div id="ui-popup-message"></div>',
            '  <input id="ui-popup-input" type="text" />',
            '  <div id="ui-popup-actions">',
            '    <button class="ui-popup-btn secondary" id="ui-popup-cancel">Cancel</button>',
            '    <button class="ui-popup-btn" id="ui-popup-ok">OK</button>',
            '  </div>',
            '</div>'
        ].join('');

        document.body.appendChild(overlay);

        state.overlay = overlay;
        state.popup = overlay.querySelector('#ui-popup');
        state.titleEl = overlay.querySelector('#ui-popup-title');
        state.messageEl = overlay.querySelector('#ui-popup-message');
        state.inputEl = overlay.querySelector('#ui-popup-input');
        state.okBtn = overlay.querySelector('#ui-popup-ok');
        state.cancelBtn = overlay.querySelector('#ui-popup-cancel');

        state.okBtn.addEventListener('click', () => handleOk());
        state.cancelBtn.addEventListener('click', () => handleCancel());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) handleCancel();
        });
        document.addEventListener('keydown', handleKeydown);
    }

    function openPopup(opts) {
        ensurePopup();
        state.open = true;
        state.type = opts.type;

        state.titleEl.textContent = opts.title || (opts.type === 'prompt' ? 'Input' : 'Notice');
        state.messageEl.textContent = opts.message || '';

        if (opts.type === 'prompt') {
            state.inputEl.style.display = 'block';
            state.inputEl.value = opts.defaultValue || '';
        } else {
            state.inputEl.style.display = 'none';
            state.inputEl.value = '';
        }

        if (opts.type === 'alert') {
            state.cancelBtn.style.display = 'none';
        } else {
            state.cancelBtn.style.display = 'inline-flex';
        }

        state.overlay.style.display = 'flex';
        requestAnimationFrame(() => {
            if (opts.type === 'prompt') {
                state.inputEl.focus();
                state.inputEl.select();
            } else {
                state.okBtn.focus();
            }
        });

        return new Promise((resolve) => {
            state.resolve = resolve;
        });
    }

    function closePopup(result) {
        state.open = false;
        state.overlay.style.display = 'none';
        if (state.resolve) {
            const resolve = state.resolve;
            state.resolve = null;
            resolve(result);
        }
    }

    function handleOk() {
        if (!state.open) return;
        if (state.type === 'prompt') {
            closePopup(state.inputEl.value);
        } else if (state.type === 'confirm') {
            closePopup(true);
        } else {
            closePopup(true);
        }
    }

    function handleCancel() {
        if (!state.open) return;
        if (state.type === 'confirm') {
            closePopup(false);
        } else if (state.type === 'prompt') {
            closePopup(null);
        } else {
            closePopup(true);
        }
    }

    function handleKeydown(e) {
        if (!state.open) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            handleOk();
        }
    }

    window.uiAlert = function (message, options = {}) {
        return openPopup({ type: 'alert', message, title: options.title });
    };

    window.uiConfirm = function (message, options = {}) {
        return openPopup({ type: 'confirm', message, title: options.title });
    };

    window.uiPrompt = function (message, defaultValue = '', options = {}) {
        return openPopup({ type: 'prompt', message, defaultValue, title: options.title });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensurePopup);
    } else {
        ensurePopup();
    }
})();
