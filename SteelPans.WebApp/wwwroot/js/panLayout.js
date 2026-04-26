window.panLayout = {
    observe(container) {
        if (!container) return;

        const update = () => this.update(container);

        container._panGridObserver?.disconnect();
        container._panGridObserver = new ResizeObserver(update);
        container._panGridObserver.observe(container);

        update();
    },

    update(container) {
        if (!container) return;

        const count = Number(container.dataset.panCount || 0);
        if (count <= 0) return;

        const rect = container.getBoundingClientRect();
        const gap = parseFloat(getComputedStyle(container).columnGap) || 0;

        const firstSvg = container.querySelector(".sp-svg");
        let aspect = 1;

        if (firstSvg) {
            const viewBox = firstSvg.viewBox?.baseVal;
            if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
                aspect = viewBox.width / viewBox.height;
            }
        }

        let bestCols = 1;
        let bestScore = 0;

        for (let cols = 1; cols <= count; cols++) {
            const rows = Math.ceil(count / cols);

            const cellWidth = (rect.width - gap * (cols - 1)) / cols;
            const cellHeight = (rect.height - gap * (rows - 1)) / rows;

            if (cellWidth <= 0 || cellHeight <= 0) continue;

            const renderedSvgHeight = Math.min(cellHeight, cellWidth / aspect);
            const renderedSvgWidth = renderedSvgHeight * aspect;

            const score = renderedSvgWidth * renderedSvgHeight;

            if (score > bestScore) {
                bestScore = score;
                bestCols = cols;
            }
        }

        container.dataset.cols = bestCols;
        container.style.setProperty("--pan-cols", bestCols);
    }
};