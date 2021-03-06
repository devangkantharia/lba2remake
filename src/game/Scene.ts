import * as THREE from 'three';
import {
    map,
    filter,
    each
} from 'lodash';

import islandSceneMapping from './scenery/island/data/sceneMapping';
import { loadActor, DirMode } from './actors';
import { loadPoint } from './points';
import { loadZone } from './zones';
import { loadScripts } from '../scripting';
import { killActor } from './scripting';
import { createFPSCounter } from '../ui/vr/vrFPS';
import { createVRGUI } from '../ui/vr/vrGUI';
import { angleToRad, WORLD_SIZE } from '../utils/lba';
import { getScene, getSceneMap } from '../resources';
import { getParams } from '../params';
import DebugData, { loadSceneMetaData } from '../ui/editor/DebugData';
import Game from './Game';
import Renderer from '../renderer';
import { selectCamera } from './scene/camera';
import { loadScenery, Scenery } from './scenery';
import { SceneManager } from './SceneManager';
import { createSceneVariables, findUsedVarGames } from './scene/variables';
import Island from './scenery/island/Island';

interface Entities {
    readonly actors: any[];
    readonly zones: any[];
    readonly points: any[];
}

export default class Scene {
    readonly index: number;
    readonly data: any;
    readonly game: Game;
    readonly renderer: Renderer;
    readonly camera: any;
    readonly actors: any[];
    readonly zones: any[];
    readonly points: any[];
    readonly sceneNode: THREE.Object3D;
    vrGUI?: THREE.Object3D;
    readonly threeScene: THREE.Scene;
    savedState: string;
    private sceneManager: SceneManager;
    firstFrame: boolean;
    variables: number[];
    usedVarGames: number[];
    readonly scenery: Scenery;
    sideScenes: Map<number, Scene>;
    extras: any[];
    isActive: boolean;
    zoneState: {
        listener?: Function;
        ended: boolean;
    };
    vr: boolean;
    is3DCam: boolean;

    static async load(
        game: Game,
        renderer: Renderer,
        sceneManager: SceneManager,
        index: number,
        parent: Scene = null
    ): Promise<Scene> {
        const data = await getScene(index);
        const params = getParams();
        if (params.editor) {
            await loadSceneMetaData(index);
        }
        const scenery = parent ? parent.scenery : await loadScenery(game, data);
        const is3DCam = data.isIsland || renderer.vr || params.iso3d;
        const entities = {
            actors: await Promise.all(map(
                data.actors,
                actor => loadActor(
                    game,
                    is3DCam,
                    scenery,
                    data.ambience,
                    actor,
                    !!parent
                )
            )),
            zones: map(data.zones, props => loadZone(props, is3DCam, params.editor)),
            points: map(data.points, props => loadPoint(props)),
        };

        const scene = new Scene(game, renderer, sceneManager, data, scenery, entities, parent);

        if (data.isIsland && !parent) {
            scene.loadSideScenes();
        }
        return scene;
    }

    private constructor(
        game: Game,
        renderer: Renderer,
        sceneManager: SceneManager,
        data,
        scenery: Scenery,
        entities: Entities,
        parent: Scene
    ) {
        const params = getParams();
        this.index = data.index;
        this.game = game;
        this.renderer = renderer;
        this.sceneManager = sceneManager;
        this.data = data;
        this.actors = entities.actors;
        this.zones = entities.zones;
        this.points = entities.points;
        this.isActive = false;

        loadScripts(game, this);

        this.variables = createSceneVariables(entities.actors);
        this.usedVarGames = findUsedVarGames(entities.actors);
        this.firstFrame = false;
        this.zoneState = { listener: null, ended: false };
        this.vr = renderer.vr;
        this.is3DCam = data.isIsland || renderer.vr || params.iso3d;
        this.savedState = null;
        this.sceneManager = sceneManager;
        this.extras = [];
        this.sceneNode = new THREE.Object3D();

        if (parent) {
            this.threeScene = parent.threeScene;
            this.camera = parent.camera;
            this.scenery = parent.scenery;
            killActor(this.actors[0]);
        } else {
            this.threeScene = new THREE.Scene();
            this.threeScene.matrixAutoUpdate = false;
            this.threeScene.add(scenery.threeObject);
            this.threeScene.name = data.isIsland ? 'scene_island' : 'scene_iso';
            this.camera = selectCamera(game, renderer, data.isIsland);
            if (this.camera.controlNode) {
                this.threeScene.add(this.camera.controlNode);
                if (renderer.vr) {
                    this.addVRGUI();
                }
            }
            this.addLight();
            this.scenery = scenery;
        }

        this.initSceneNode();
    }

    private async loadSideScenes() {
        const sceneMap = await getSceneMap();
        const sideIndices = filter(
            map(sceneMap, (indexInfo, sideIndex: number) => {
                if (sideIndex !== this.index
                    && indexInfo.isIsland
                    && sideIndex in islandSceneMapping) {
                    const sideMapping = islandSceneMapping[sideIndex];
                    const mainMapping = islandSceneMapping[this.index];
                    if (sideMapping.island === mainMapping.island
                        && sideMapping.variant === mainMapping.variant) {
                        return sideIndex;
                    }
                }
                return null;
            }),
            id => id !== null
        );

        const sideScenesList = await Promise.all(map(
            sideIndices,
            async sideIndex => Scene.load(
                this.game,
                this.renderer,
                this.sceneManager,
                sideIndex,
                this
            )
        ));
        this.sideScenes = new Map<number, Scene>();
        each(sideScenesList, (sideScene: Scene) => {
            this.sideScenes[sideScene.index] = sideScene;
        });
    }

    private addVRGUI() {
        const fps = createFPSCounter(this.renderer);
        fps.visible = false;
        this.camera.controlNode.add(fps);
        this.vrGUI = createVRGUI();
        this.camera.controlNode.add(this.vrGUI);
    }

    private addLight() {
        const { ambience } = this.data;
        const light = new THREE.DirectionalLight();
        light.name = 'DirectionalLight';
        light.position.set(-1000, 0, 0);
        light.position.applyAxisAngle(
            new THREE.Vector3(0, 0, 1),
            -(ambience.lightingAlpha * 2 * Math.PI) / 0x1000
        );
        light.position.applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            -(ambience.lightingBeta * 2 * Math.PI) / 0x1000
        );
        light.updateMatrix();
        light.matrixAutoUpdate = false;
        this.threeScene.add(light);
        const ambient = new THREE.AmbientLight(0xFFFFFF, 0.08);
        ambient.name = 'AmbientLight';
        this.threeScene.add(ambient);
    }

    private initSceneNode() {
        const { editor } = getParams();
        this.sceneNode.matrixAutoUpdate = false;
        if (this.scenery instanceof Island) {
            const sectionIdx = islandSceneMapping[this.data.index].section;
            const section = this.scenery.sections[sectionIdx];
            this.sceneNode.name = `island_section_${sectionIdx}`;
            this.sceneNode.position.x = section.x * WORLD_SIZE * 2;
            this.sceneNode.position.z = section.z * WORLD_SIZE * 2;
            this.sceneNode.updateMatrix();
        } else {
            this.sceneNode.name = `iso_scene_${this.index}`;
        }

        for (const actor of this.actors) {
            this.addMesh(actor.threeObject);
        }
        if (editor) {
            for (const zone of this.zones) {
                this.addMesh(zone.threeObject);
            }
            for (const point of this.points) {
                this.addMesh(point.threeObject);
            }
        }
        this.threeScene.add(this.sceneNode);
    }

    async goto(index, force = false, wasPaused = false, teleport = true) {
        return this.sceneManager.goto(index, force, wasPaused, teleport);
    }

    reset() {
        const params = getParams();
        if (params.editor) {
            this.game.getState().load(this.savedState, this.actors[0]);
            this.game.setUiState({ text: null, cinema: false });
            this.variables = createSceneVariables(this.actors);
            each(this.actors, (actor) => {
                actor.reset(this);
            });
            this.firstFrame = true;
            if (this.game.isPaused()) {
                DebugData.step = true;
            }
        }
    }

    removeMesh(threeObject) {
        if (threeObject) {
            this.sceneNode.remove(threeObject);
        }
    }

    addMesh(threeObject) {
        if (threeObject) {
            this.sceneNode.add(threeObject);
        }
    }

    addExtra(extra) {
        this.extras.push(extra);
        this.addMesh(extra.threeObject);
    }

    removeExtra(extra) {
        const idx = this.extras.indexOf(extra);
        if (idx !== -1) {
            this.extras.splice(idx, 1);
        }
        this.removeMesh(extra.threeObject);
    }

    relocateHeroFrom(sourceScene: Scene, teleport: boolean) {
        const hero = sourceScene.actors[0];
        const globalPos = new THREE.Vector3();
        const newHero = this.actors[0];
        globalPos.applyMatrix4(hero.threeObject.matrixWorld);
        this.sceneNode.remove(newHero.threeObject);
        newHero.threeObject = hero.threeObject;
        newHero.threeObject.position.copy(globalPos);
        newHero.threeObject.position.sub(this.sceneNode.position);
        newHero.model = hero.model;
        newHero.label = hero.label;
        newHero.refreshLabel = hero.refreshLabel;
        this.sceneNode.add(newHero.threeObject);

        newHero.props.dirMode = hero.props.dirMode;
        newHero.props.entityIndex = hero.props.entityIndex;
        newHero.props.bodyIndex = hero.props.bodyIndex;
        newHero.props.animIndex = hero.props.animIndex;

        if (teleport) {
            newHero.props.dirMode = DirMode.MANUAL;

            const {pos, angle} = newHero.props;
            const position = new THREE.Vector3(pos[0], pos[1], pos[2]);
            const angleRad = angleToRad(angle);
            const euler = new THREE.Euler(0, angleRad, 0, 'XZY');

            newHero.physics.position.copy(position);
            newHero.physics.orientation.setFromEuler(euler);
            newHero.physics.temp.destination.copy(position);
            newHero.physics.temp.position.copy(position);
            newHero.physics.temp.angle = angleRad;
            newHero.physics.temp.destAngle = angleRad;

            newHero.threeObject.position.set(pos[0], pos[1], pos[2]);
            newHero.threeObject.quaternion.copy(newHero.physics.orientation);
        } else {
            newHero.physics.position.copy(newHero.threeObject.position);
            newHero.physics.orientation.copy(hero.physics.orientation);
            newHero.physics.temp.angle = hero.physics.temp.angle;
            newHero.physics.temp.position.copy(hero.physics.temp.position);
            newHero.physics.temp.destination.copy(hero.physics.temp.destination);
        }

        newHero.animState = hero.animState;
        Object.keys(hero.props.runtimeFlags).forEach((k) => {
            newHero.props.runtimeFlags[k] = hero.props.runtimeFlags[k];
        });
        hero.animState = null;
        hero.model = null;
        hero.threeObject = null;
    }
}
