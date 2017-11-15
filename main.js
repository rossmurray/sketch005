var fnMain = (function() {
    function render(deltaMs, state) {
        requestAnimationFrame(function(timestamp){
            render(timestamp, state);
        });
        state.app.renderer.render(state.app.stage);
        state.recorder.capture(state.app.renderer.view);
    }

    function getConfig() {
        //const pstring = '#49496A,#D2FB78,#C13BFE,#5821D4,#49CDF6';
        //const pstring = 'yellow,#22BCBC,yellow';
        //const pstring = 'black,white,black';
        const pstring = 'cyan,magenta,cyan';
        const palette = pstring.split(',');
        return {
            nSides: 6,
            shapeRadius: 0.09,
            shapeHolePercent: 1,
            shrinkPercent: 0.7,
            spinDuration: 700,
            spinOffset: 3,
            spinPause: 500,
            spinEasing: 'easeOutQuad',
            screenMargin: 0, //percent on each edge not included in 'board' rectangle
            colorScale: chroma.scale(palette).mode('hsl'), //modes: lch, lab, hsl, rgb
            shapeAlpha: 1,
            shapeBlendMode: PIXI.BLEND_MODES.NORMAL,
            palette: palette,
            backgroundColor: 0x0,
        };
    }

    function makeBoardRectangle(margin, viewRectangle) {
        const xmargin = margin * viewRectangle.width;
        const ymargin = margin * viewRectangle.height;
        const boardWidth = viewRectangle.width - (xmargin * 2);
        const boardHeight = viewRectangle.height - (ymargin * 2);
        return new PIXI.Rectangle(xmargin, ymargin, boardWidth, boardHeight);
    }

    function makeRange(n) {
        var arr = Array.apply(null, Array(n));
        return arr.map(function (x, i) { return i });
    };

    function RGBTo24bit(rgbArray) {
        let result = Math.floor(rgbArray[2])
            | Math.floor(rgbArray[1]) << 8
            | Math.floor(rgbArray[0]) << 16;
        return result;
    }

    function portion(i, size) {
        return i / ((size -1) || 1);
    }

    function makeBackground(config, screenRect, renderer) {
        const canvasElement = document.createElement('canvas');
        canvasElement.width = screenRect.width;
        canvasElement.height = screenRect.height;
        const context = canvasElement.getContext('2d');
        const gradient = context.createLinearGradient(screenRect.x, screenRect.y, screenRect.width, screenRect.height);
        const steps = 10;
        for(let i = 0; i < steps; i++) {
            const p = portion(i,steps);
            const color = config.colorScale(p).name();
            gradient.addColorStop(p, color);
        }
        context.fillStyle = gradient;
        context.fillRect(0, 0, screenRect.width, screenRect.height);
        //----
        const texture = PIXI.Texture.fromCanvas(canvasElement);
        const sprite = new PIXI.Sprite(texture);
        return sprite;
    }

    function drawNSideRegular(graphics, nSides, centerX, centerY, radius, color24, alpha) {
        graphics.beginFill(color24, alpha);
        const points = makeRange(nSides).map((x,i) => {
            const fixedRotation = 0.25;
            const amountAround = i / nSides + fixedRotation;
            const vx = radius * Math.cos(Math.PI * 2 * amountAround) + centerX;
            const vy = radius * Math.sin(Math.PI * 2 * amountAround) + centerY;
            const point = new PIXI.Point(Math.round(vx) + 0, Math.round(vy) + 0);
            return point;
        });
        graphics.drawPolygon(points);
        graphics.endFill();
        graphics.lineStyle(5, 0x0);
        graphics.moveTo(Math.round(centerX),Math.round(centerY));
        graphics.lineTo(points[0].x, points[0].y)
        graphics.moveTo(Math.round(centerX),Math.round(centerY));
        graphics.lineTo(points[2].x, points[2].y)
        graphics.moveTo(Math.round(centerX),Math.round(centerY));
        graphics.lineTo(points[4].x, points[4].y)
        graphics.lineStyle(0);
        return points;
    }

    function makeShapes(config, board, renderer) {
        const diameter = config.shapeRadius * 2;
        const testPoints = drawNSideRegular(new PIXI.Graphics(), config.nSides, config.shapeRadius, config.shapeRadius, config.shapeRadius, config.backgroundColor, 1);
        const shapeWidth = testPoints[5].x - testPoints[1].x;
        const shapeHeight = (diameter + (testPoints[1].y - testPoints[2].y)) / 2;
        const colCount = Math.ceil(board.width / shapeWidth) + 1;
        const rowCount = Math.ceil(board.height / shapeHeight) + 1;
        const shapeCount = colCount * rowCount;
        const diagDist = function(j,k) {
            return (portion(j,colCount) + portion(k,rowCount)) / 2;
        };
        const shapes = makeRange(shapeCount).map(() => {return {};});
        for(let j = 0; j < colCount; j++) { //columns
            for(let k = 0; k < rowCount; k++) { //rows
                const i = k + rowCount * j;
                const shape = shapes[i];
                const g = new PIXI.Graphics();
                g.width = diameter;
                g.height = diameter;
                const color = RGBTo24bit(config.colorScale(diagDist(j,k)).rgb());
                const polygonPoints = drawNSideRegular(g, config.nSides, config.shapeRadius, config.shapeRadius, config.shapeRadius, config.backgroundColor, 1);
                const smallerRadius = Math.round(config.shapeRadius * config.shapeHolePercent);
                drawNSideRegular(g, config.nSides, config.shapeRadius, config.shapeRadius, smallerRadius, 0xFFFFFF, config.shapeAlpha);
                const texture = PIXI.RenderTexture.create(diameter, diameter);
                renderer.render(g, texture);
                const sprite = new PIXI.Sprite(texture);
                const evenRow = (k % 2 == 0);
                const rowShift = evenRow ? 0 : shapeWidth * -0.5;
                sprite.x = rowShift + board.left + j * shapeWidth;
                sprite.y = board.top + k * shapeHeight;
                sprite.anchor.set(0.5, 0.5);
                sprite.blendMode = config.shapeBlendMode;
                shape.sprite = sprite;
            }
        }
        return shapes;
    }

    function animateShapes(shapes, board, config) {
        const timeline = anime.timeline({
            autoplay: false,
            loop: true,
        });
        for(let i = 0; i < shapes.length; i++) {
            const shape = shapes[i];
            const offset = (1 - portion(i, shapes.length)) * (config.spinDuration * config.spinOffset);
            timeline
            .add({
                targets: shape.sprite.scale,
                x: [{
                    value: config.shrinkPercent,
                    duration: config.spinDuration,
                },{
                    value: 1,
                    duration: config.spinDuration,
                },{
                    value: 1,
                    duration: config.spinPause
                }],
                y: [{
                    value: config.shrinkPercent,
                    duration: config.spinDuration,
                },{
                    value: 1,
                    duration: config.spinDuration,
                },{
                    value: 1,
                    duration: config.spinPause
                }],
                easing: config.spinEasing,
                offset: offset,
            });
        }
        return timeline;
    }

    return (function() {
        const config = getConfig();
        const mainel = document.getElementById("main");
        let app = new PIXI.Application({
            width: mainel.width,
            height: mainel.height,
            view: mainel,
            autoResize: true,
            antialias: true,
            autoStart: false,
        });
        app.renderer.backgroundColor = config.backgroundColor;
        app.renderer.render(app.stage);
        //note: this prevents ticker starting when a listener is added. not when the application starts.
        app.ticker.autoStart = false;
        app.ticker.stop();

        let board = makeBoardRectangle(config.screenMargin, app.screen);
        const smaller = board.width < board.height ? board.width : board.height;
        config.shapeRadius = Math.round(config.shapeRadius * smaller);
        const shapes = makeShapes(config, board, app.renderer);
        const background = makeBackground(config, app.screen, app.renderer);
        app.stage.addChild(background);
        for(let s of shapes) {
            app.stage.addChild(s.sprite);
        }
        const animation = animateShapes(shapes, board, config);
        let state = {
            config: config,
            app: app,
            board: board,
            animation: animation,
            shapes: shapes,
            background: background,
        };
        return function(recorder) {
            state.recorder = recorder || {capture: function(){}};
            app.start();
            render(Date.now(), state);
            animation.play();
            return state;
        }
    })();
})();