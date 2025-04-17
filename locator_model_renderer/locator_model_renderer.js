const PLUGIN_ID = 'locator_model_renderer';
const PLUGIN_VERSION = '1.0.0';

//#region Project Model Parser

class LocatorModelParser {
    constructor(project) {
        Project.selectedProject = project;
        this.selectedModel = null;
        this.setMatrix();
    }

    setMatrix(matrix = new THREE.Matrix4(), isItemModel = false) {
        if (!Project.selectedProject) return;
        this.dispose();
        this.selectedModel = Project.selectedProject.model_3d.clone();
        if (!this.selectedModel) return;


        // apply offset and display context transfromations
        if(isItemModel) {
            this.selectedModel.applyMatrix4(new THREE.Matrix4().makeTranslation(-8,-8,-8));
            if(Project.selectedDisplayContext) this.applyDisplayContext(Project.selectedDisplayContext);
        }
        // apply scale from slider
        let finalScale = /^seat_\d+$/.test(Project.selectedLocator.name)?0.9375/Project.modelScale:Project.modelScale
        if (Project.modelScale) this.selectedModel.applyMatrix4(new THREE.Matrix4().makeScale(finalScale,finalScale,finalScale));
        
        // apply locator position and rotation
        this.selectedModel.applyMatrix4(matrix);

        Project.model_3d.add(this.selectedModel);
    }

    applyDisplayContext(displayContext) {
        let isLeft = (displayContext.slot_id==="thirdperson_lefthand" || displayContext.slot_id==="firstperson_lefthand"); 

        // display context stuff
        this.selectedModel.applyMatrix4(new THREE.Matrix4()
        .makeScale(
            displayContext.scale[0],
            displayContext.scale[1],
            displayContext.scale[2]
        ));
        this.selectedModel.applyMatrix4(new THREE.Matrix4()
        .makeRotationFromEuler(new THREE.Euler(
            displayContext.rotation[0] * (Math.PI / 180),
            (isLeft?-3:1)*displayContext.rotation[1] * (Math.PI / 180),
            (isLeft?-1:1)*displayContext.rotation[2] * (Math.PI / 180)
        )));
        this.selectedModel.applyMatrix4(new THREE.Matrix4()
        .makeTranslation(
            displayContext.translation[0],
            displayContext.translation[1],
            (isLeft?-1:1)*displayContext.translation[2]
        ));

        //Apply Cobblemon specific held item transformations
        switch (displayContext.slot_id) {
            case "fixed":
                this.selectedModel.applyMatrix4(new THREE.Matrix4()
                .makeScale(.5,.5,.5));
                this.selectedModel.applyMatrix4(new THREE.Matrix4()
                .makeRotationX(90 * (Math.PI / 180)));
                this.selectedModel.applyMatrix4(new THREE.Matrix4()
                .makeTranslation(0,.25,0));
                break;
            case "thirdperson_righthand":
            case "thirdperson_lefthand":
                this.selectedModel.applyMatrix4(new THREE.Matrix4()
                .makeRotationX(-90 * (Math.PI / 180)));
                this.selectedModel.applyMatrix4(new THREE.Matrix4()
                .makeRotationZ(90 * (Math.PI / 180)));
                this.selectedModel.applyMatrix4(new THREE.Matrix4()
                .makeTranslation((isLeft?-1:1),0,0));
                break;
            case "head":
                this.selectedModel.applyMatrix4(new THREE.Matrix4()
                .makeScale(.62,.62,.62));
                if(Project.selectedLocator.name === "item_hat") {
                    this.selectedModel.applyMatrix4(new THREE.Matrix4()
                    .makeTranslation(0,-4.25,0));
                }
                else if (Project.selectedLocator.name === "item_face") {
                    this.selectedModel.applyMatrix4(new THREE.Matrix4()
                    .makeTranslation(0,.5,4.25));
                }
                break;
        }
    }

    dispose() {
        if(this.selectedModel) {
            Project.model_3d.remove(this.selectedModel);
            this.selectedModel = null;
        }
    }
}
//#endregion





//#region Model Rendering
class ModelRenderer {
    constructor() {
        if (Project){
            Project.selectedProject = null;
            Project.selectedDisplayContext = null;
            Project.selectedLocator = null;
            Project.locatorModel = null;
            Project.modelScale = 1.0;
        }
    }

    async init() {
        this.setupUI();
        this.updateRendering();
        Blockbench.on('render_frame', this.updateModelPositions.bind(this));
        Blockbench.on('update_selection', this.updatePanelSettings.bind(this));
        Blockbench.on('select_project', this.updatePanelSettings.bind(this));
        Blockbench.on('close_project', this.updatePanelSettings.bind(this));
    }

    async updateRendering() {
        if (Project.locatorModel) {
            Project.locatorModel.dispose();
            delete Project.locatorModel;
        }

        if (Project.selectedProject && Project.selectedLocator) {
            try {
                Project.locatorModel = new LocatorModelParser(Project.selectedProject);
                this.updateModelPositions();
            } catch (e) {
                console.error('Failed to load model:', e);
            }
        }
    }

    updateModelPositions() {
        if (Project.locatorModel && Project.selectedLocator && Project.selectedProject) {
            if (Project.selectedLocator.mesh) Project.locatorModel.setMatrix(Project.selectedLocator.mesh.matrixWorld, Project.selectedProject.format.id === 'java_block');
        }
    }

    setupUI() {
        const self = this;
        //todo clean up panel ui, probably lots of redundant logic here but I don't want to touch it cause it works
        this.panel = new Panel(PLUGIN_ID, {
            id: PLUGIN_ID,
            name: 'Locator Model Renderer',
            default_position: 'bottom',
            component: Vue.extend({
                template: PANEL_HTML,
                data() {
                    return {
                        projectType: (Project)?Project.format.id:"",
                        selected: Project.selectedProject,
                        context: Project.selectedDisplayContext,
                        locator: Project.selectedLocator,
                        isItem: (Project.selectedProject) ? (Project.selectedProject.format.id === "java_block") : false,
                        isSeat: (Project.selectedLocator) ? /^seat_\d+$/.test(Project.selectedLocator.name) : false,
                        scale: (Project.modelScale) ? Project.modelScale : 1.0,
                        projects: ModelProject.all.slice(),
                        locators: Locator.all.slice()
                    };
                },
                computed: {
                    filteredProjects() {
                        return this.projects.filter(p => p.uuid != Project.uuid);
                    },
                    getContexts() {
                        return this.selected.display_settings;
                    }
                },
                methods: {
                    onProjectSelect() {
                        Project.selectedProject = this.selected;
                        if (this.selected) {
                            this.isItem = (this.selected.format.id === "java_block");
                            if (this.isItem && this.context) if(this.selected.display_settings[this.context.slot_id]) Project.selectedDisplayContext = this.selected.display_settings[this.context.slot_id];
                        }
                        this.updateSettings();
                    },
                    onContextSelect() {
                        Project.selectedDisplayContext = this.context;
                        this.updateSettings();
                    },
                    onLocatorSelect() {
                        Project.selectedLocator = this.locator;
                        if(this.locator && this.selected) {
                            this.isSeat =  /^seat_\d+$/.test(this.locator.name); // set scale if seat locator is selected
                            if ((this.locator.name === "item_hat" || this.locator.name === "item_face") && this.selected.display_settings.head) Project.selectedDisplayContext = this.selected.display_settings.head;
                            else if (this.selected.display_settings.fixed) Project.selectedDisplayContext = this.selected.display_settings.fixed;                            
                        
                            if(Project.selectedLocator.parent.name.startsWith("locator_")) Project.selectedLocator.parent.select();
                            else Project.selectedLocator.select();
                            Project.selectedLocator.showInOutliner();
                        }
                        this.updateSettings();
                    }, 
                    onScaleChange() {
                        Project.modelScale = this.scale;
                        this.updateSettings();
                    },
                    updateSettings() {
                        this.projectType = Project.format.id,
                        this.selected = Project.selectedProject;
                        this.context = Project.selectedDisplayContext;
                        this.locator = Project.selectedLocator;
                        this.isSeat = (Project.selectedLocator) ? /^seat_\d+$/.test(Project.selectedLocator.name) : false;
                        this.isItem = (Project.selectedProject) ? (Project.selectedProject.format.id === "java_block") : false;
                        this.scale = (Project.modelScale) ? Project.modelScale : 1.0;
                        this.projects = ModelProject.all.slice();
                        this.locators = Locator.all.slice();
                        self.updateRendering();
                    }
                },
                mounted() {
                    this.selected = Project.selectedProject;
                    this.context = Project.selectedDisplayContext;
                    self.vueInstance = this;
                    
                    this.observer = new MutationObserver(() => {
                        this.updateSettings();
                    });
                },
                beforeDestroy() {
                    if (this.observer) {
                        this.observer.disconnect();
                    }
                    self.vueInstance = null;
                }
            })
        });
    }

    updatePanelSettings() {
        if(this.vueInstance) this.vueInstance.updateSettings();
    }

    cleanup() {
        this.panel.delete();
        ModelProject.all.forEach(p => {
            if (p.locatorModel) {
                p.locatorModel.dispose();
            }
            p.selectedProject = undefined;
            p.selectedDisplayContext = undefined;
            p.selectedLocator = undefined;
            p.locatorModel = undefined;
            p.modelScale = undefined;
        })
    }
}
//#endregion





//#region Panel HTML
// Main
const PANEL_HTML =
`
<div class="bedrock-item-renderer" style="margin-left: 20px;">
    <template v-if="projectType !== 'java_block' && projectType !== 'modded_entity'">
    
        <div class="status">
            <template v-if="selected">
                Selected: {{ selected.name || 'Untitled' }}
            </template>
            <template v-else>
                No project selected
            </template>
        </div>
    
        <div class="inputs">
            <div style="display: inline-block; margin-right: 20px;">
                <label for="project">Project</label></br>
                <select id="project" v-model="selected" @change="onProjectSelect">
                    <option :value="null">None</option>
                    <option 
                    v-for="project in filteredProjects" 
                    :value="project"
                    :key="project.uuid"
                    >
                    {{ project.name || 'Untitled' }}
                    </option>
                </select>
            </div>
    
    
            <template v-if="selected">
                <div style="display: inline-block; margin-right: 20px;">
                    <label for="locator">Locator</label></br>
                    <select id="locator" v-model="locator" @change="onLocatorSelect">
                        <option :value="null">None</option>
                        <option 
                        v-for="locator in locators" 
                        :value="locator"
                        >
                        {{ locator.name || 'Untitled' }}
                        </option>
                    </select>
                </div>
                <template v-if="isItem">
                    <div style="display: inline-block; margin-right: 20px;">
                        <label for="context">Context</label></br>
                        <select id="context" v-model="context" @change="onContextSelect">
                            <option :value="null">None</option>
                            <option 
                            v-for="context in getContexts" 
                            :value="context"
                            >
                            {{ context.slot_id || 'Untitled' }}
                            </option>
                        </select>
                    </div>
                </template>
            </template>
        </div>
        </br>
        <template v-if="selected">
            <div class="scale" style="display: inline-block;">
                <template v-if="isSeat">
                    <label for="scale_slider" >Pokemon's Base Scale</label></br>
                </template>
                <template v-else>
                    <label for="scale_slider" >Locator Scale</label></br>
                </template>
                <input v-model="scale" @input="onScaleChange" id="scale_slider" type="range"  value="1.00" min=".50" max="3.00" step=".01" style="width: 150px; position: absolute;">
                <input v-model="scale" @change="onScaleChange" id="scale_number" type="number" value="1.00" min=".50" max="3.00" step=".01" style="width: 60px; margin-left: 160px; margin-top: 4px;">
            </div>
        </template>
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
    hide_locator_btn = new Toggle('hide_locators', {
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

    swap_primary_btn = new Action('swap_primary', {
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

    folder_locator_btn = new Action('locator_folder', {
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

    check_locator_btn = new Action('check_universal_locators', {
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
    author: 'Josh',
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
        this.renderer = new ModelRenderer();
        this.renderer.init();
        createActionButtons();
    },
    onunload() {
        this.renderer.cleanup();
        delete this.renderer;
        deleteActionButtons();
    }
});
//#endregion
