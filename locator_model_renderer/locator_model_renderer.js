const PLUGIN_ID = 'locator_model_renderer';
const PLUGIN_VERSION = '1.1.2';

// #region Project Model Parser
class ParsedLocatorModel {
    constructor(locator) {
        this.origin = locator;
        this.modelClone = null;
        this.setMatrix();
    }

    setMatrix(matrix = new THREE.Matrix4()) {
        this.dispose();
        if (!this.origin.model) return;
        this.modelClone = this.origin.model.clone();

        // apply offset and display context transfromations
        if(this.origin.isItem) {
            this.modelClone.applyMatrix4(new THREE.Matrix4().makeTranslation(-8,-8,-8));
            this.applyDisplayContext(this.origin.displayContext);
        }

        // apply scale from scale slider
        let finalScale = /^seat_\d+$/.test(this.origin.name)?0.9375/this.origin.scale:this.origin.scale
        if (this.origin.scale) this.modelClone.applyMatrix4(new THREE.Matrix4().makeScale(finalScale,finalScale,finalScale));
        
        // apply locator position and rotation
        this.modelClone.applyMatrix4(matrix);

        Project.model_3d.add(this.modelClone);
    }

    // #region Display Context Transformations
    applyDisplayContext(displayContext) {
        if (!displayContext) return;
        let isLeft = (displayContext.slot_id==="thirdperson_lefthand" || displayContext.slot_id==="firstperson_lefthand"); 

        // Apply default display context transforms
        this.modelClone.applyMatrix4(new THREE.Matrix4()
        .makeScale(
            displayContext.scale[0],
            displayContext.scale[1],
            displayContext.scale[2]
        ));
        this.modelClone.applyMatrix4(new THREE.Matrix4()
        .makeRotationFromEuler(new THREE.Euler(
            displayContext.rotation[0] * (Math.PI / 180),
            (isLeft?-3:1)*displayContext.rotation[1] * (Math.PI / 180),
            (isLeft?-1:1)*displayContext.rotation[2] * (Math.PI / 180)
        )));
        this.modelClone.applyMatrix4(new THREE.Matrix4()
        .makeTranslation(
            displayContext.translation[0],
            displayContext.translation[1],
            (isLeft?-1:1)*displayContext.translation[2]
        ));

        // Apply Cobblemon specific held item transformations
        switch (displayContext.slot_id) {
            case "fixed":
                this.modelClone.applyMatrix4(new THREE.Matrix4()
                .makeScale(.5,.5,.5));
                this.modelClone.applyMatrix4(new THREE.Matrix4()
                .makeRotationX(90 * (Math.PI / 180)));
                this.modelClone.applyMatrix4(new THREE.Matrix4()
                .makeTranslation(0,.25,0));
                break;
            case "thirdperson_righthand":
            case "thirdperson_lefthand":
                this.modelClone.applyMatrix4(new THREE.Matrix4()
                .makeRotationX(-90 * (Math.PI / 180)));
                this.modelClone.applyMatrix4(new THREE.Matrix4()
                .makeRotationZ(90 * (Math.PI / 180)));
                this.modelClone.applyMatrix4(new THREE.Matrix4()
                .makeTranslation((isLeft?-1:1),0,0));
                break;
            case "head":
                this.modelClone.applyMatrix4(new THREE.Matrix4()
                .makeScale(.62,.62,.62));
                if(this.origin.name === "item_hat") {
                    this.modelClone.applyMatrix4(new THREE.Matrix4()
                    .makeTranslation(0,-4.25,0));
                }
                else if (this.origin.name === "item_face") {
                    this.modelClone.applyMatrix4(new THREE.Matrix4()
                    .makeTranslation(0,.5,4.25));
                }
                break;
        }
    }

    dispose() {
        if(this.modelClone) Project.model_3d.remove(this.modelClone);
        this.modelClone = null;
    }
    //#endregion
}
//#endregion



//#region Model Rendering
class ModelRenderer {
    constructor() {
        this.init()
    }
    
    init() {
        this.setupUI();
        this.updateRendering();
        Blockbench.on('render_frame', this.updateModelPositions.bind(this));
        Blockbench.on('display_animation_frame', this.updateModelPositions.bind(this))
        Blockbench.on('update_selection', this.updatePanelSettings.bind(this));
        Blockbench.on('select_project', this.updatePanelSettings.bind(this));
        Blockbench.on('close_project', this.updatePanelSettings.bind(this));
    }

    clearAllLocatorInfo() {
        if (Project.parsedLocators && Project.parsedLocators.length > 0) {
            Project.parsedLocators.forEach(parsedLocator => {
                parsedLocator.origin.scale = 1.00;
                parsedLocator.origin.displayContext = undefined;
                parsedLocator.origin.projectUUID = undefined;
                parsedLocator.origin.isItem = false;
                parsedLocator.origin.model = undefined;
                parsedLocator.origin = null;
                parsedLocator.dispose();
            });
            Project.parsedLocators.length = 0;
        }
        Project.parsedLocators = Project.parsedLocators || [];
    }

    updateRendering() {
        if (Project.parsedLocators && Project.parsedLocators.length > 0) {
            Project.parsedLocators.forEach(parsedLocator => parsedLocator.dispose());
            Project.parsedLocators.length = 0;
        }
        Project.parsedLocators = Project.parsedLocators || [];
        for (const locator of Locator.all) {
            try {
                Project.parsedLocators.push( new ParsedLocatorModel(locator) );
            } catch (e) {
                console.error('Failed to load model:', e);
            }
        }
        this.updateModelPositions();
    }

    updateModelPositions() {
        if (!Project.parsedLocators) return
        for (const model of Project.parsedLocators) {
            model.setMatrix(model.origin.mesh.matrixWorld);
        }
    }

    //#region Panel Interface
    setupUI() {
        const self = this;
        this.panel = new Panel(PLUGIN_ID, {
            id: PLUGIN_ID,
            name: 'Locator Model',
            default_position: {
                slot: 'left_bar',
				height: 130,
                folded: false
            },
            default_side: 'left',
            growable: true,
            resizable: true,
            component: Vue.extend({
                template: PANEL_HTML,
                data() {
                    return {
                        projectType: Project ? Project.format.id : "",
                        projects: ModelProject.all.slice(),
                        locators: Locator.all.slice(),
                        locator: undefined,
                        project: undefined,
                        context: undefined,
                        scale: 1.00,
                        isItem: false,
                        isSeat: false,
                    };
                },
                computed: {
                    getContexts() {
                        return this.project?.display_settings ?? {};
                    },
                    filteredProjects() {
                        return this.projects.filter(p => p.uuid != Project.uuid);
                    },
                    sortedLocators() {
                        return this.locators.sort((a, b) => {
                            const nameA = (a.name || 'Untitled').toLowerCase();
                            const nameB = (b.name || 'Untitled').toLowerCase();
                            return nameA.localeCompare(nameB);
                        })
                    },
                    isEdited() {
                        return !(this.project === undefined && this.context === undefined && this.scale == 1.00);
                    }
                },
                methods: {
                    clearAll() {
                        this.locator = undefined;
                        this.refresh();
                        self.clearAllLocatorInfo();
                    },
                    refresh() {
                        this.project =  undefined;
                        this.context = undefined;
                        this.scale = 1.00;
                        Locator.selected.forEach(locator => { 
                            locator.unselect();
                            if(locator.parent.name.startsWith("locator_")) locator.parent.unselect();
                        });
                        this.updateSettings();
                    },
                    updateValues() {
                        this.project = ModelProject.all.find(p => p.uuid === this.locator?.projectUUID) || undefined;
                        this.context = this.locator?.displayContext;
                        this.scale = this.locator?.scale || 1.00;
                    },
                    updateAnimations() {
                        if (!Animator.open) return;

                        const playAnimIfLocator = (animName, locatorName) => {
                            const animation = Animation.all.find(anim => anim.name.endsWith('.' + animName));
                            const locator = Project.parsedLocators.find(locators => locators.origin.name === locatorName);

                            animation?.togglePlayingState(locator?.modelClone ? 'locked' : false);// if animation and parsed locatr exist, play the animation.
                        };

                        playAnimIfLocator('hold_item', 'item');
                        playAnimIfLocator('wear_hat', 'item_hat');
                    },
                    onProjectSelect() {
                        this.context = this.project ? Object.values(this.project.display_settings)[0] : undefined;
                        this.updateSettings();
                    },
                    onContextSelect() {
                        this.updateSettings();
                    },
                    onScaleChange() {
                        this.updateSettings();
                    },
                    onLocatorSelect() {                        
                        if (this.locator) {
                            this.updateValues();

                            if (this.locator.parent.name.startsWith("locator_")) this.locator.parent.select();
                            else this.locator.select();
                            this.locator.showInOutliner();
                        } 
                        else this.refresh();

                        this.updateSettings();
                    }, 
                    updateSettings() {
                        this.projectType = Project.format.id,

                        this.projects = ModelProject.all.slice();
                        this.locators = Locator.all.slice();

                        if (this.locator) {                       
                            this.isSeat = /^seat_\d+$/.test(this.locator.name);
                            this.isItem = this.project?.format.id === "java_block" ?? false;

                            this.locator.projectUUID = this.project?.uuid;
                            this.locator.model = this.project?.model_3d;
                            this.locator.isItem = this.isItem;
                            
                            this.locator.displayContext = this.context;

                            this.locator.scale = this.scale || 1.00;
                        }

                        self.updateRendering();
                        this.updateAnimations();
                    }
                },
                mounted() {
                    const style = document.createElement('style');
                    style.textContent = `
                        .bedrock-item-renderer label {
                            display: inline-block;    
                            color: var(--color-subtle_text);
                        }
                        .bedrock-item-renderer select {
                            width: 160px;
                        }
                        .bedrock-item-renderer .inputLabel {
                            display: inline-flex;
                            width: 70px;
                        }
                        .bedrock-item-renderer #scale_slider {
                            display: inline-block;
                            margin-left: -2px;
                        }
                    `;
                    document.head.appendChild(style);
                    self.vueInstance = this;
                    
                    this.observer = new MutationObserver(() => {
                        this.updateSettings();
                    });
                },
                beforeDestroy() {
                    if (this.observer) this.observer.disconnect();
                    self.vueInstance = null;
                }
            })
        });
    }
    //#endregion

    updatePanelSettings() {
        if(this.vueInstance) {
            this.vueInstance.locator = Project.selected_elements.find(e => e instanceof Locator) || undefined;
            this.vueInstance.updateValues();
            this.vueInstance.updateSettings();

            if(Project.format.id === "java_block") Canvas.updateAllFaces();// fixes the broken faces on item models
        }
    }

    cleanup() {
        this.panel.delete();
        this.clearAllLocatorInfo();
    }
}
//#endregion



//#region Panel HTML
const PANEL_HTML =
`
<div class="bedrock-item-renderer" style="margin-left: 20px;">
    <template v-if="projectType !== 'java_block' && projectType !== 'modded_entity'">
        <div class="inputs" style="display: flex;flex-direction: column; gap: 4px; margin-right: 20px;">
            <label>
                <span class="inputLabel">Locator</span>   
                <select id="locator" v-model="locator" @change="onLocatorSelect">
                    <option :value="undefined">None</option>
                    <option 
                    v-for="locator in sortedLocators" 
                    :value="locator"
                    :key="locator.uuid"
                    >
                    {{ locator.name || 'Untitled' }}
                    </option>
                </select>
                <template v-if="isEdited">
                    <div @click=refresh style="position: fixed;" class="tool head_right" title="Clear Settings"><i class="material-icons">replay</i></div>
                </template> 
            </label>
    
            <template v-if="locator">
                <label>
                    <span class="inputLabel">Model</span>
                    <select id="project" v-model="project" @change="onProjectSelect">
                        <option :value="undefined">None</option>
                        <option 
                        v-for="project in filteredProjects" 
                        :value="project"
                        :key="project.uuid"
                        >
                        {{ project.name || 'Untitled' }}
                        </option>
                    </select>
                </label>

                <template v-if="project">
                    <template v-if="isItem">
                        <label>
                            <span class="inputLabel">Context</span>
                            <select id="context" v-model="context" @change="onContextSelect">
                                <option :value="undefined">None</option>
                                <option 
                                v-for="context in getContexts" 
                                :value="context"
                                :key="context.slot_id"
                                >
                                {{ context.slot_id.toUpperCase() || 'Untitled' }}
                                </option>
                            </select>
                        </label>
                    </template>
                    
                    <label>
                        <span class="inputLabel">
                            <template v-if="isSeat">Base Scale</template>
                            <template v-else>Scale</template>
                        </span>
                        <div id="scale_slider" class="bar slider_input_combo" title="Scale">
                            <input type="range" v-model.number="scale" class="tool disp_range" style="width: 116px; margin-left: 3px;"
                                :min="0.05"
                                :max="4.00"
                                :step="0.01"
                                value="1.00" @dblclick="scale=1.0;onScaleChange();" @input="onScaleChange">
                            <numeric-input id="scale_number" v-model.number="scale" class="tool disp_text" :min="0.05" :max="4.00" :step="0.05" value="1.00" @input="onScaleChange" @change="onScaleChange"/>
                        </div>
                    </label>
                </template>
            </template>
            <input type="button" id="clear_all" value='Clear All' @click="clearAll" title="Clear All" style="background-color: #ffffff0f">
        </div>
    </template>
</div>
`;
//#endregion



//#region Action buttons
const universal_locators = [
    "root",
    "top",
    "target",
    "middle",
    "head",
    "face",
    "physical",
    "special",
    "item",
    "item_hat",
    "item_face"
];

function createActionButtons() {
    hide_locator_btn = new Toggle('hide_locators', {// Hides all locator UI icons
        name: 'Hide Locators',
        description: 'Hides all the locators on the model.',
        icon: 'visibility',
        onChange(value) {
            Undo.initEdit({elements: Locator.all});
            Locator.all.forEach(locator => {
                locator.visibility = !value;
            });
            Canvas.updateVisibility();
            Undo.finishEdit('Locators Hidden');
        }
    });

    swap_primary_btn = new Action('swap_primary', {// Flips the name of locators that end with Primary/Secondary
        name: 'Rename Locators',
        description: 'Flips the name of locators that end with Primary/Secondary',
        icon: 'sync_alt',
        click: function() {
            Undo.initEdit({elements: Locator.selected});
            function rename(str) {
                return str.replace(
                    /_(primary|secondary|left|right)(\d*)$/,
                    (match, p1, p2) => {
                        const swaps = { primary: 'secondary', secondary: 'primary', left: 'right', right: 'left'};
                        return `_${swaps[p1]}`;
                    }
                );
            }

            Locator.selected.forEach(locator => {
                if (locator.parent.name.startsWith("locator_")) {
                    locator.parent.name = rename(locator.parent.name);
                    locator.parent.createUniqueName();
                }
                locator.name = rename(locator.name);
                locator.createUniqueName();
                
            });
            Canvas.updateAll();
            Undo.finishEdit('Flipped Locator');
        }
    });

    folder_locator_btn = new Action('locator_folder', {// Creates floder prefixed with "locator_" 
        name: 'Create Locator Folder',
        description: 'Adds all selected locators into their own folder prefixed with "locator_".',
        icon: 'folder',
        click: function() {
            Undo.initEdit({elements: Locator.selected});
            Locator.selected.forEach(locator => {
                if (locator.parent.name != "locator_"+locator.name){
                    bone = new Group("locator_"+locator.name).init();
                    bone.addTo(locator.parent);
                    locator.addTo(bone);
                    bone.origin = getSelectionCenter();
                    bone.select();
                    bone.showInOutliner();
                }
                else Blockbench.showQuickMessage(`'${locator.name}' is already in a folder.`, 1500)
            });
            Undo.finishEdit('Create Locator Folder');
        }
    });

    check_locator_btn = new Action('check_universal_locators', {// Checks if all universal locators are present in the model
        name: 'Check Locators',
        description: 'Checks this model for universal locators.',
        icon: 'sentiment_satisfied',
        click: function() { 
            const allLocatorNames = Locator.all.map(locator => locator.name);
            const missingLocators = universal_locators.filter(universalName => {
                const regex = new RegExp(`^${universalName}\\d*$`);
                return !allLocatorNames.some(name => regex.test(name));
            });

            if (missingLocators.length === 0) Blockbench.showQuickMessage(`No missing locators :)`, 2000);
            else Blockbench.showQuickMessage(`Locators Missing: ${missingLocators}`, 3500);

            Blockbench.showStatusMessage(`Total Locators: ${allLocatorNames.length}`, 2000)
        }
    });

    MenuBar.addAction(hide_locator_btn, 'filter');
    MenuBar.addAction(swap_primary_btn, 'filter');
    MenuBar.addAction(folder_locator_btn, 'filter');
    MenuBar.addAction(check_locator_btn, 'filter');
}
function deleteActionButtons() {
    hide_locator_btn.delete();
    swap_primary_btn.delete();
    folder_locator_btn.delete();
    check_locator_btn.delete();
}
//#endregion



//#region Register plugin
BBPlugin.register(PLUGIN_ID, {
    title: 'Locator Model Renderer',
    author: 'joshxviii',
    description: 'Select an open Model Project and render it onto a selected Locator. Plus some other helpful Locator shortcuts.',
    about: 
    `To use this plugin, first open the Model Project that you would like to render another model on.
    This Project has to be a bedrock entity model and should have some Locator(s).
    After that you can select from any other open Model Project.
    The selected Model will render on a selected Locator.
    This plugin was made for Cobblemon models, but should work with other bedrock entity models.`,
    icon: 'icon.png',
    version: PLUGIN_VERSION,
    min_version: '4.8.0',
    variant: 'both',
    onload() {
        if (this.renderer) this.renderer.cleanup();
        this.renderer = new ModelRenderer();
        createActionButtons();
    },
    onunload() {
        if (this.renderer) this.renderer.cleanup();
        delete this.renderer;
        deleteActionButtons();
    },
    devReload() {
        if (this.renderer) this.renderer.cleanup();
        this.renderer = new ModelRenderer();
    }
});
//#endregion