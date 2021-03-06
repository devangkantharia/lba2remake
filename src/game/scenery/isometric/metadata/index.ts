import { each } from 'lodash';
import { loadMetadata } from './metadata';
import {
    initReplacements,
    applyReplacement,
    buildReplacementMeshes,
} from './replacements';
import { processLayoutMirror, buildMirrors } from './mirrors';
import { saveFullSceneModel } from './models';
import { getGridMetadata } from '../grid';
import { getPalette, getGrids, getBricks } from '../../../../resources';
import { checkVariantMatch } from './matchers/variants';
import { checkBaseLayoutMatch } from './matchers/baseLayout';
import { loadBrickMask } from '../mask';

export async function extractGridMetadata(grid, entry, ambience, is3D, numActors) {
    if (!is3D) {
        return {
            replacements: { threeObject: null, update: null },
            mirrors: null
        };
    }
    const metadata = await loadMetadata(entry, grid.library);

    const replacements = await initReplacements(entry, metadata, ambience, numActors);
    const mirrorGroups = {};

    computeReplacements({grid, metadata, replacements, mirrorGroups, apply: true });

    return {
        replacements,
        mirrors: buildMirrors(mirrorGroups)
    };
}

export async function saveSceneReplacementModel(entry, ambience) {
    const [palette, bricks, gridMetadata, mask] = await Promise.all([
        getPalette(),
        getBricks(),
        getGridMetadata(entry + 1),
        loadBrickMask()
    ]);

    const grid = await getGrids(entry + 1, { bricks, mask, palette, is3D: true, gridMetadata });

    const metadata = await loadMetadata(entry, grid.library, true);
    const replacements = await initReplacements(entry, metadata, ambience, 0);

    computeReplacements({grid, metadata, replacements});
    buildReplacementMeshes(replacements);
    saveFullSceneModel(replacements, entry);
}

function computeReplacements({ grid, metadata, replacements, mirrorGroups = null, apply = false }) {
    each(metadata.variants, (variant) => {
        forEachCell(grid, metadata, (cellInfo) => {
            checkVariant(grid, cellInfo, replacements, variant);
        });
    });
    forEachCell(grid, metadata, (cellInfo) => {
        const { replace, mirror, suppress } = cellInfo;
        if (replace) {
            checkBaseLayout(grid, cellInfo, replacements);
        }

        if (apply) {
            if (mirror) {
                processLayoutMirror(cellInfo, mirrorGroups);
            }
            if (suppress) {
                const { x, y, z } = cellInfo.pos;
                replacements.bricks.add(`${x},${y},${z}`);
            }
        }
    });
}

function checkVariant(grid, cellInfo, replacements, variant) {
    if (checkVariantMatch(grid, cellInfo, variant.props, replacements)) {
        applyReplacement(cellInfo, replacements, {
            type: 'variant',
            data: variant.props,
            replacementData: {
                ...variant,
                parent: cellInfo
            }
        });
    }
}

function checkBaseLayout(grid, cellInfo, replacements) {
    const {y} = cellInfo.pos;
    const {nX, nY, nZ} = cellInfo.layout;
    const idx = cellInfo.blocks[y].block;
    const zb = Math.floor(idx / (nY * nX));
    const yb = Math.floor(idx / nX) - (zb * nY);
    const xb = idx % nX;
    // Check brick at the bottom corner of layout
    if (yb === 0 && xb === nX - 1 && zb === nZ - 1) {
        if (checkBaseLayoutMatch(grid, cellInfo, replacements)) {
            applyReplacement(cellInfo, replacements, {
                type: 'layout',
                data: cellInfo.layout,
                replacementData: cellInfo
            });
        }
    }
}

function forEachCell(grid, metadata, handler) {
    let c = 0;
    for (let z = 0; z < 64; z += 1) {
        for (let x = 0; x < 64; x += 1) {
            const cell = grid.cells[c];
            const blocks = cell.blocks;
            for (let y = 0; y < blocks.length; y += 1) {
                if (blocks[y]) {
                    const layout = grid.library.layouts[blocks[y].layout];
                    if (layout && layout.index in metadata.layouts) {
                        handler({
                            ...metadata.layouts[layout.index],
                            layout,
                            pos: {x, y, z},
                            blocks
                        });
                    }
                }
            }
            c += 1;
        }
    }
}
