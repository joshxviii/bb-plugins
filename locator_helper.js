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
]

BBPlugin.register('locator_helper', {
    title: 'Locator Helper',
    author: 'Josh',
    icon: '☻',
    description: 'Helps check for universal locators and adds some other shortcuts.',
    version: '0.0.1',
    variant: 'both',
    onload() {

        hide_locator_btn = new Toggle('hide_locators', {
            name: 'Hide Locators',
            description: 'Hides all the locators.',
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

        folder_locator_btn = new Action('locator_folder', {
            name: 'Create Locator Folder',
            description: 'Adds all selected locators into their own folder.',
            icon: 'folder',
            click: function() {
                Undo.initEdit({elements: Locator.selected});
                
                Locator.selected.forEach(locator => {
                    if (locator.parent.name != "locator_"+locator.name){
                        bone = new Group("locator_"+locator.name).init();
                        bone.addTo(locator.parent);
                        locator.addTo(bone);
                    }
                    else Blockbench.showQuickMessage(`'${locator.name}' is already in a folder.`, 1500)
                });

                Undo.finishEdit('Create Locator Folder');
            }
        });

        check_locator_btn = new Action('check_universal_locators', {
            name: 'Check Locators',
            description: 'Checks this model for universal locators.',
            icon: '☺',
            click: function() {
                const allLocatorNames = Locator.all.map(locator => locator.name);
                const missingLocators = universal_locators.filter(universalName => {
                    const regex = new RegExp(`^${universalName}\\d*$`);
                    return !allLocatorNames.some(name => regex.test(name));
                });

                if (missingLocators.length === 0) {
                    Blockbench.showQuickMessage(`No missing locators :)`, 2000);
                }
                else Blockbench.showQuickMessage(`Missing Locators:\n ${missingLocators}`, 3500)
            }
        });


        MenuBar.addAction(hide_locator_btn, 'filter');
        MenuBar.addAction(locator_btn, 'filter');
        MenuBar.addAction(check_locator_btn, 'filter');
    },
    onunload() {
        hide_locator_btn.delete();
        locator_btn.delete();
        check_locator_btn.delete();
    }
});