const PLUGIN_ID = 'bookmarks';
const PLUGIN_VERSION = '1.0.0';
const BOOKMARKS_FILE = PathModule.join(app.getPath('userData'), 'plugins/bookmarks.json');

let bookmark_action;

const style = document.createElement('style');
style.textContent = `
    #bookmark_container {
        display: inline-flex;
        align-items: center;
        height: 100%;
        padding-right: 2px;
        border-right: solid var(--color-back) 3px;
    }
    #bookmark_container .project_tab {
        width: 32px !important;
        min-width: 32px !important;
    }
`;

const bookmarkContainer = document.createElement('div');
bookmarkContainer.id = 'bookmark_container';

// Save bookmarks to file
function saveBookmarks() {
    const bookmarks = [...new Set(
        ModelProject.all
        .filter(project => project.bookmarked && project.save_path)
        .map(project => project.save_path)
    )];
    Blockbench.writeFile(
        BOOKMARKS_FILE,
        { 
            content: JSON.stringify(bookmarks, null, 2),
            savetype: 'text'
        }
    );
}

// Load and open bookmarked projects
async function loadBookmarkedProjects() {
    console.log('Loading bookmarks from:', BOOKMARKS_FILE);
    Blockbench.readFile(
        [BOOKMARKS_FILE],
        { readtype: 'text', errorbox: false },
        files => {
            if (!files || !files[0]) return;
            try {
                const bookmarks = JSON.parse(files[0].content);
                if (!Array.isArray(bookmarks)) return;
                (async () => {
                    for (const filePath of bookmarks) {
                        await new Promise(resolve => {
                            Blockbench.read(
                                [filePath],
                                { readtype: 'text', errorbox: false },
                                async projectFiles => {
                                    if (projectFiles && projectFiles[0]) {
                                        let parsed_content = JSON.parse(projectFiles[0].content);
                                        setupProject(Formats[parsed_content.meta.model_format] || Formats.free);
                                        Codecs.project.parse(parsed_content, filePath);
                                        Project.save_path = filePath;
                                        Project.bookmarked = true;
                                        console.log('Opening bookmarked project:', Project, filePath);
                                        setTimeout(async () => { // wait for selected tab to updated
                                            updateTabs();
                                            resolve();
                                        }, 0);
                                    } else resolve();
                                }
                            );
                        });
                    }
                })();
            } catch (err) {
                console.error('Failed to parse bookmarks:', err);
            }
        }
    );

}

// Update tab positions based on bookmark status
function updateTabs() {
    const tabBarList = Interface.tab_bar.$el.querySelector('#tab_bar_list');
    const currentTab = Interface.tab_bar.$el.querySelector('.project_tab.selected');
    if (currentTab) {
        if (Project.bookmarked) bookmarkContainer.append(currentTab);
        else tabBarList.insertBefore(currentTab, tabBarList.lastChild);
            
        currentTab.classList.toggle('bookmarked', Project.bookmarked);
        updateBookmarkAction()
    }
}

function updateBookmarkAction() {
    if (!bookmark_action) return;
    bookmark_action.setIcon(Project.bookmarked ? 'bookmark_remove' : 'bookmark_add');
    bookmark_action.setName(Project.bookmarked ? 'Remove Bookmark' : 'Bookmark Project');
}

function addBookmarkButton() {
    bookmark_action = new Action('bookmark_project', {
        description: 'Bookmark the current project to the tab bar',
        click: function() {
            if (!Project) return;

            if (!Project.save_path) {
                Blockbench.showQuickMessage('Please save the project first.', 2000);
                return;
            }

            Project.bookmarked = !Project.bookmarked;

            saveBookmarks();
            updateTabs();
        }
    });

    Blockbench.on('select_project update_selection open_project close_project', e => {
        updateBookmarkAction();
    });

    Blockbench.on('save_project', project => {
        if (project.bookmarked) saveBookmarks();
    });


    // Override mouseDown to prevent dragging for bookmarked tabs
    const originalMouseDown = Interface.tab_bar.mouseDown;
    Interface.tab_bar.mouseDown = function(tab, e1) {
        if (e1.target.closest('#bookmark_container')) {
            if (!e1.target.classList.contains('project_tab_close_button')) {
                this.selectProject(tab, e1);
            }
            return;
        }
        originalMouseDown.call(this, tab, e1);
    };

    ModelProject.prototype.menu.addAction(bookmark_action, '0');

    updateBookmarkAction();
}


BBPlugin.register(PLUGIN_ID, {
    title: 'Bookmarks',
    author: 'joshxviii',
    description: 'Allows you to bookmark projects to tab bar.',
    about:
    `Right click on a project tab and select "Bookmark Project" to bookmark it. <br>
    Bookmarked projects are pinned to the left of the tab bar and automatically open on startup.`,
    icon: 'bookmark',
    version: PLUGIN_VERSION,
    min_version: '4.8.0',
    variant: 'both',
    async onload() {
        document.head.appendChild(style);
        Interface.tab_bar.$el.querySelector('#tab_bar_list').prepend(bookmarkContainer);
        await loadBookmarkedProjects();
        addBookmarkButton();
    },
    onunload() {
        style.remove();
        bookmarkContainer.remove();
        bookmark_action.delete();
    }
});