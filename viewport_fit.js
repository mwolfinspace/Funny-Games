(function () {
    let stage = null;
    let container = null;
    let raf = null;
    let resizeObserver = null;
    let bodyObserver = null;
    const floatingIds = new Set(['ui-popup-overlay']);

    function scheduleFit() {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(applyFit);
    }

    function applyFit() {
        if (!stage || !container) return;

        stage.style.transform = '';
        stage.style.left = '0';
        stage.style.top = '0';

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const contentW = stage.scrollWidth;
        const contentH = stage.scrollHeight;

        if (!contentW || !contentH || !vw || !vh) return;

        const scale = Math.min(1, vw / contentW, vh / contentH);

        if (scale >= 0.999) {
            stage.style.transform = '';
            return;
        }

        const offsetX = Math.max(0, (vw - contentW * scale) / 2);
        const offsetY = Math.max(0, (vh - contentH * scale) / 2);
        stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    function init() {
        if (document.body && document.body.dataset && document.body.dataset.viewportFit === 'off') {
            return;
        }
        if (document.getElementById('viewport-fit-container')) return;

        const body = document.body;
        if (!body) return;

        container = document.createElement('div');
        container.id = 'viewport-fit-container';

        stage = document.createElement('div');
        stage.id = 'viewport-fit-stage';

        const floatingNodes = [];
        while (body.firstChild) {
            const node = body.firstChild;
            if (node.id && floatingIds.has(node.id)) {
                floatingNodes.push(node);
                body.removeChild(node);
            } else {
                stage.appendChild(node);
            }
        }

        container.appendChild(stage);
        body.appendChild(container);
        floatingNodes.forEach(node => body.appendChild(node));

        window.addEventListener('resize', scheduleFit);
        window.addEventListener('orientationchange', scheduleFit);

        if (window.ResizeObserver) {
            resizeObserver = new ResizeObserver(scheduleFit);
            resizeObserver.observe(stage);
        }

        if (window.MutationObserver) {
            bodyObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType !== 1) return;
                        if (node === container) return;
                        if (node.id && floatingIds.has(node.id)) {
                            if (node.parentNode === stage) {
                                stage.removeChild(node);
                                body.appendChild(node);
                            }
                            return;
                        }
                        if (node.parentNode === body) {
                            stage.appendChild(node);
                        }
                    });
                });
            });
            bodyObserver.observe(body, { childList: true });
        }

        scheduleFit();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.requestViewportFit = scheduleFit;
})();
