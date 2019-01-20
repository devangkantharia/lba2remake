import * as async from 'async';

import * as THREE from 'three';
import {loadHqr} from '../hqr';
import {loadEntity, getBodyIndex, getAnimIndex, getAnim, Entity} from './entity';
import {loadBody} from './body';
import {loadAnim} from './anim';
import {
    initSkeleton,
    createSkeleton,
    updateKeyframe,
    updateKeyframeInterpolation
} from './animState';
import {processAnimAction} from './animAction';
import {loadMesh} from './geometries';
import {loadTexture2} from '../texture';
import {createBoundingBox} from '../utils/rendering';
import {Time} from '../datatypes';

export interface Model {
    state: any;
    anims: any;
    files?: any;
    entities: Entity[];
    mesh: THREE.Object3D;
}

export async function loadModel(params: any,
                          entityIdx: number,
                          bodyIdx: number,
                          animIdx: number,
                          animState: any,
                          envInfo: any,
                          ambience: any) {
    const [ress, body, anim, anim3ds] = await Promise.all([
        loadHqr('RESS.HQR'),
        loadHqr('BODY.HQR'),
        loadHqr('ANIM.HQR'),
        loadHqr('ANIM3DS.HQR')
    ]);
    const files = {ress, body, anim, anim3ds};
    return loadModelData(
        params,
        files,
        entityIdx,
        bodyIdx,
        animIdx,
        animState,
        envInfo,
        ambience
    );
}

/** Load Models Data
 *  Model will hold data specific to a single model instance.
 *  This will allow to mantain different states for body animations.
 *  This module will still kept data reloaded to avoid reload twice for now.
 */
function loadModelData(params: any,
                       files,
                       entityIdx,
                       bodyIdx,
                       animIdx,
                       animState: any,
                       envInfo: any,
                       ambience: any) {
    if (entityIdx === -1 || bodyIdx === -1 || animIdx === -1)
        return null;

    const palette = new Uint8Array(files.ress.getEntry(0));
    const entityInfo = files.ress.getEntry(44);
    const entities = loadEntity(entityInfo);

    const model = {
        palette,
        files,
        bodies: [],
        anims: [],
        texture: loadTexture2(files.ress.getEntry(6), palette),
        state: null,
        mesh: null,
        entities,
        boundingBox: null,
        boundingBoxDebugMesh: null,
    };

    const entity = entities[entityIdx];

    const realBodyIdx = getBodyIndex(entity, bodyIdx);
    const realAnimIdx = getAnimIndex(entity, animIdx);

    const body = loadBody(model, model.bodies, realBodyIdx, entity.bodies[bodyIdx]);
    const anim = loadAnim(model, model.anims, realAnimIdx);

    const skeleton = createSkeleton(body);
    initSkeleton(animState, skeleton, anim.loopFrame);
    model.mesh = loadMesh(
        body,
        model.texture,
        animState.bones,
        animState.matrixRotation,
        model.palette,
        envInfo,
        ambience
    );

    if (model.mesh) {
        model.boundingBox = body.boundingBox;
        if (params.editor) {
            model.boundingBoxDebugMesh = createBoundingBox(
                body.boundingBox,
                new THREE.Vector3(1, 0, 0)
            );
            model.boundingBoxDebugMesh.name = 'BoundingBox';
            model.boundingBoxDebugMesh.visible = false;
            model.mesh.add(model.boundingBoxDebugMesh);
        }
    }

    return model;
}

export function updateModel(game: any,
                            sceneIsActive: any,
                            model: any,
                            animState: any,
                            entityIdx: number,
                            animIdx: number,
                            time: Time) {
    const entity = model.entities[entityIdx];
    const entityAnim = getAnim(entity, animIdx);
    if (entityAnim !== null) {
        const realAnimIdx = entityAnim.animIndex;
        const anim = loadAnim(model, model.anims, realAnimIdx);
        animState.loopFrame = anim.loopFrame;
        if (animState.prevRealAnimIdx !== -1 && realAnimIdx !== animState.prevRealAnimIdx) {
            updateKeyframeInterpolation(anim, animState, time, realAnimIdx);
        }
        if (realAnimIdx === animState.realAnimIdx || animState.realAnimIdx === -1) {
            updateKeyframe(anim, animState, time, realAnimIdx);
        }
        if (sceneIsActive) {
            processAnimAction({
                game,
                model,
                entityAnim,
                animState
            });
        }
    }
}
