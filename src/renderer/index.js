import * as THREE from 'three';
import {map} from 'lodash';
import setupStats from './stats';
import WebVR from './tools/WebVR';
import {EngineError} from '../crash_reporting';

const PixelRatioMode = {
    DEVICE: () => window.devicePixelRatio || 1.0,
    DOUBLE: () => 2.0,
    NORMAL: () => 1.0,
    HALF: () => 0.5,
    QUARTER: () => 0.25
};

export const PixelRatio = map(['DEVICE', 'DOUBLE', 'NORMAL', 'HALF', 'QUARTER'], (name, idx) => ({
    getValue: PixelRatioMode[name],
    index: idx,
    name
}));

export function createRenderer(params, canvas, rendererOptions = {}) {
    let pixelRatio = PixelRatio[2]; // SET NORMAL AS DEFAULT
    const getPixelRatio = () => pixelRatio.getValue();
    let antialias = false;
    // eslint-disable-next-line no-console
    const displayRenderMode = () => console.log(`Renderer mode: pixelRatio=${pixelRatio.name}(${pixelRatio.getValue()}x), antialiasing(${antialias})`);
    let threeRenderer =
        setupThreeRenderer(pixelRatio, canvas, antialias, params.webgl2, rendererOptions);
    const stats = setupStats();

    const vrButton = WebVR.createButton(threeRenderer, {
        frameOfReferenceType: 'eye-level'
    });

    if (vrButton) {
        threeRenderer.vr.enabled = true;
        const renderZone = document.getElementById('renderZone');
        if (renderZone) {
            renderZone.appendChild(vrButton);
        }
    }

    displayRenderMode();

    function keyListener(event) {
        if (event.code === 'KeyH') {
            antialias = !antialias;
            threeRenderer = setupThreeRenderer(pixelRatio, canvas, antialias);
            renderer.threeRenderer = threeRenderer;
            displayRenderMode();
            renderer.resize();
        }
        if (event.code === 'KeyR') {
            pixelRatio = PixelRatio[(pixelRatio.index + 1) % PixelRatio.length];
            threeRenderer.setPixelRatio(pixelRatio.getValue());
            displayRenderMode();
            renderer.resize();
        }
    }

    const renderer = {
        canvas,

        /* @inspector(locate) */
        render: (scene) => {
            const width = threeRenderer.getSize().width;
            const height = threeRenderer.getSize().height;
            scene.camera.resize(width, height);
            threeRenderer.render(scene.threeScene, scene.camera.threeCamera);
        },

        /* @inspector(locate) */
        applySceneryProps: (props) => {
            const sc = props.envInfo.skyColor;
            const color = new THREE.Color(sc[0], sc[1], sc[2]);
            const opacity = props.opacity !== undefined ? props.opacity : 1;
            threeRenderer.setClearColor(color.getHex(), opacity);
        },

        stats,

        /* @inspector(locate) */
        resize: (
            width = threeRenderer.getSize().width,
            height = threeRenderer.getSize().height
        ) => {
            threeRenderer.setSize(width, height);
        },

        /* @inspector(locate, pure) */
        pixelRatio: () => getPixelRatio(),

        /* @inspector(locate) */
        setPixelRatio(value) { threeRenderer.setPixelRatio(value); },

        /* @inspector(locate) */
        dispose() {
            window.removeEventListener('keydown', keyListener);
        },

        threeRenderer,

        vr: threeRenderer.vr.enabled
    };

    window.addEventListener('keydown', keyListener);

    return renderer;
}

function setupThreeRenderer(pixelRatio, canvas, antialias, webgl2, rendererOptions = {}) {
    try {
        const options = {
            antialias,
            alpha: false,
            canvas,
            preserveDrawingBuffer: rendererOptions.preserveDrawingBuffer
        };
        if (webgl2 && window.WebGL2RenderingContext) {
            options.context = canvas.getContext('webgl2');
            // eslint-disable-next-line
            console.log('Using WebGL 2');
        } else {
            // eslint-disable-next-line
            console.log('Using WebGL 1');
        }
        const renderer = new THREE.WebGLRenderer(options);

        renderer.setClearColor(0x000000);
        renderer.setPixelRatio(pixelRatio.getValue());
        renderer.setSize(0, 0);
        renderer.autoClear = true;

        if (!(window.WebGL2RenderingContext
                && renderer.context instanceof window.WebGL2RenderingContext)) {
            renderer.context.getExtension('EXT_shader_texture_lod');
            renderer.context.getExtension('OES_standard_derivatives');
        }
        return renderer;
    } catch (err) {
        throw new EngineError('webgl');
    }
}
