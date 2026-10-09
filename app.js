(() => {
  "use strict";

  const DB_NAME = "veritas-studio";
  const DB_STORE = "vault-handles";
  const STORAGE_KEY = "veritas-studio-vault";
  const PROJECTS_KEY = "veritas-studio-projects";
  const PROJECT_DATA_PREFIX = "veritas-studio-project:";
  const desktop = window.veritasDesktop;
  if (desktop) document.documentElement.classList.add("desktop-app");
  const MODULES = [
    { id: "ideation", name: "Ideation", description: "Brainstorming, loglines, and conceptual notes", icon: "✧" },
    { id: "writing", name: "Writing", description: "Manuscript, editor, entities, and plot planner", icon: "✎" },
    { id: "editing", name: "Editing", description: "Versions, revision checklists, and editorial notes", icon: "◷" },
    { id: "publishing", name: "Publishing", description: "Marketing plans, launch checklist, and export", icon: "↗" }
  ];
  const PREFERENCES_KEY = "veritas-studio-preferences";
  const DEFAULT_GOAL = 500;
  const DEFAULT_SCHEMAS = {
    character: [
      { name: "Name", type: "text" },
      { name: "Age", type: "number" },
      { name: "Role", type: "text" },
      { name: "Home", type: "text" },
      { name: "Secret", type: "text" }
    ],
    location: [
      { name: "Name", type: "text" },
      { name: "Type", type: "text" },
      { name: "Region", type: "text" }
    ],
    faction: [
      { name: "Name", type: "text" },
      { name: "Role", type: "text" }
    ]
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    files: new Map(),
    tabs: [],
    activePath: "",
    splitPath: "",
    splitDirection: "",
    dirHandle: null,
    saveTimer: null,
    scanTimer: null,
    toastTimer: null,
    updateState: { status: "idle", version: "" },
    updateScreenDismissed: false,
    dayStartWords: 0,
    dailyGoal: DEFAULT_GOAL,
    sessionStart: 0,
    dirty: false,
    dailyWords: 0,
    lastWordCount: 0,
    importedFolder: false,
    defaultDockLocations: new Map(),
    projectId: "",
    projects: [],
    currentModule: "writing",
    currentView: "editor",
    plotLayer: "surface",
    plotThread: "all",
    publishingTab: "overview",
    ideationTab: "seed",
    proofreadPath: "",
    editorSelection: null,
    plannerDragging: null,
    preferences: {
      theme: "dark",
      editorFontSize: "14",
      editorWidth: "comfortable",
      uiScale: 1,
      dailyGoal: DEFAULT_GOAL
    }
  };

  const starterFiles = [
    { path: "Manuscript/01 - The Cartographer's Silence.md", content: "# The Cartographer's Silence\n\nThe map was wrong.\n\nMara Venn knew it the moment she crossed the old bridge and saw the river running east. On every chart in the archive, it ran west. She stood in the rain with the atlas tucked beneath her coat, watching the water carry the last leaves of autumn toward a city that should not exist.\n\nBehind her, the bells of Asterfall rang thirteen times.\n\nShe had been told the thirteenth bell was only a story. She had also been told never to trust a map that drew the coast in gold.\n\nA boot scraped stone in the alley behind her.\n\n“Miss Venn,” called a voice she recognized from the royal observatory. “You have something that belongs to the Crown.”\n\nMara closed the atlas. Its leather cover was warm, almost feverish, beneath her palm.\n\n“Then the Crown should have kept better records,” she said, and ran." },
    { path: "Manuscript/02 - The Thirteenth Bell.md", content: "# The Thirteenth Bell\n\nBy morning, the whole of Asterfall had agreed that nothing unusual had happened.\n\nThe bells had rung twelve times, as they always did. The river flowed west. The bridge was dry. And Mara Venn, cartographer, had never been seen near the archive at all.\n\nOnly Elias remembered the extra chime.\n\nHe found her at the observatory with a candle guttering beside a stack of stolen charts. Rain tapped the dome overhead. Every instrument pointed toward the dark." },
    { path: "Worldbuilding/Characters/Mara Venn.md", content: "# Mara Venn\n\n**Role:** Cartographer and reluctant protagonist  \n**Home:** Asterfall  \n**Secret:** Can remember places that have been erased from maps.\n\nMara is exacting, curious, and wary of authority. She carries her mother's brass compass, which points to whatever she has lost most recently." },
    { path: "Worldbuilding/Characters/Elias Thorne.md", content: "# Elias Thorne\n\n**Role:** Royal astronomer  \n**Home:** Asterfall Observatory  \n**Secret:** He remembers the thirteenth bell.\n\nA careful scholar whose loyalty to the Crown is tested by the impossible chart." },
    { path: "Worldbuilding/Locations/Asterfall.md", content: "# Asterfall\n\nA canal city built around an observatory and a river that changes course in the old maps. Its bells regulate the city's public clocks." },
    { path: "Worldbuilding/Locations/The Glass Coast.md", content: "# The Glass Coast\n\nA northern shoreline said to appear only on maps drawn in gold ink. Sailors who find it return with memories of another life." },
    { path: "Worldbuilding/Factions/The Royal Archive.md", content: "# The Royal Archive\n\nThe Crown's institution for cartography and historical records. Archivists are sworn to preserve every approved map and destroy all unlicensed copies." },
    { path: "Timelines/Story timeline.md", content: "# Story timeline\n\n- 0 | The thirteenth bell rings in Asterfall\n- 1 | Mara discovers the river's changed course\n- 2 | Elias finds Mara at the observatory" },
    { path: "Todos/tasks.json", content: JSON.stringify({ items: [] }, null, 2) },
    { path: "config.json", content: JSON.stringify({ name: "The Cartographer's Silence", dailyWordGoal: 500, version: 1, modules: { ideation: false, writing: true, editing: false, publishing: false } }, null, 2) }
  ];

  function words(text) {
    const plain = text.replace(/[#>*_`~[\]()!-]/g, " ").trim();
    return plain ? plain.match(/\b[\p{L}\p{N}’'-]+\b/gu)?.length || 0 : 0;
  }

  function restoreMetrics() {
    try {
      const metrics = JSON.parse(localStorage.getItem(`${STORAGE_KEY}-metrics:${state.projectId || "legacy"}`) || "null");
      if (!metrics) return;
      if (metrics.date === new Date().toDateString()) {
        state.dailyWords = Number(metrics.dailyWords) || 0;
        state.dailyGoal = Number(metrics.dailyGoal) || state.dailyGoal;
      } else {
        state.dailyWords = 0;
      }
    } catch (error) {
      console.error("Could not restore today's writing statistics.", error);
      state.dailyWords = 0;
    }
  }

  function persistMetrics() {
    try {
      localStorage.setItem(`${STORAGE_KEY}-metrics:${state.projectId || "legacy"}`, JSON.stringify({
        date: new Date().toDateString(),
        dailyWords: state.dailyWords,
        dailyGoal: state.dailyGoal
      }));
    } catch (error) {
      console.error("Could not save today's writing statistics.", error);
    }
  }

  function basename(path) {
    return path.split("/").pop().replace(/\.(md|json)$/i, "");
  }

  function category(path) {
    if (path.endsWith(".json")) path = path.slice(0, -5) + ".md";
    if (path.startsWith("Manuscript/")) return "chapter";
    if (path.startsWith("Timelines/")) return "timeline";
    if (path.startsWith("Worldbuilding/")) return "lore";
    return "config";
  }

  function worldbuildingType(path) {
    const segment = path.split("/")[1]?.toLowerCase();
    if (segment === "characters") return "character";
    if (segment === "locations") return "location";
    if (segment === "factions") return "faction";
    return "lore";
  }

  function isEntityPath(path) {
    return path.endsWith(".md") && category(path) === "lore";
  }

  function companionPath(path) {
    return path.replace(/\.md$/i, ".json");
  }

  function getSchemas() {
    try {
      const config = JSON.parse(state.files.get("config.json") || "{}");
      const configured = config.schemas || {};
      return Object.fromEntries(Object.entries(DEFAULT_SCHEMAS).map(([type, fields]) => [
        type,
        Array.isArray(configured[type]) && configured[type].length
          ? configured[type].map(field => ({ ...field, options: field.options ? [...field.options] : undefined }))
          : fields.map(field => ({ ...field }))
      ]));
    } catch (error) {
      console.error("Could not read entity schemas from config.json.", error);
      return DEFAULT_SCHEMAS;
    }
  }

  function entityData(path) {
    const jsonPath = companionPath(path);
    try {
      if (state.files.has(jsonPath)) return JSON.parse(state.files.get(jsonPath));
    } catch (error) {
      console.error(`Could not parse structured entity data in ${jsonPath}.`, error);
      notify(`Invalid entity JSON: ${basename(jsonPath)}`);
    }
    const markdown = state.files.get(path) || "";
    const heading = markdown.match(/^#\s+(.+)$/m);
    const data = { Name: heading?.[1] || basename(path), Age: "" };
    markdown.replace(/^\*\*([^*]+):\*\*\s*(.*?)\s*$/gm, (_match, field, value) => {
      data[field.trim()] = value.trim();
      return _match;
    });
    return data;
  }

  function notify(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
  }

  function updateStatusText(update) {
    if (update.status === "checking") return "Checking for updates…";
    if (update.status === "current") return `You're up to date${update.version ? ` (version ${update.version})` : ""}.`;
    if (update.status === "available") return `Version ${update.version} is available. Preparing the download…`;
    if (update.status === "downloading") return `Downloading version ${update.version}${Number.isFinite(update.percent) ? ` · ${Math.floor(update.percent)}%` : ""}.`;
    if (update.status === "downloaded") return `Version ${update.version} is ready to install.`;
    if (update.status === "error") return `Update failed: ${update.message || "An unexpected error occurred."}`;
    return "Automatic update checks are available in the installed desktop app.";
  }

  function showUpdateScreen() {
    if (!["available", "downloading", "downloaded", "error"].includes(state.updateState.status)) return;
    state.updateScreenDismissed = false;
    renderUpdateScreen();
  }

  function renderUpdateScreen() {
    const update = state.updateState;
    const active = ["available", "downloading", "downloaded"].includes(update.status);
    const progress = Number.isFinite(update.percent) ? Math.max(0, Math.min(100, update.percent)) : 8;
    let screen = $(".update-screen-backdrop");
    if (!active && update.status !== "error") {
      screen?.remove();
      return;
    }
    if (!screen) {
      screen = document.createElement("div");
      screen.className = "update-screen-backdrop";
      screen.innerHTML = `<section class="update-screen" role="dialog" aria-modal="true" aria-labelledby="update-screen-title" aria-describedby="update-screen-description">
        <div class="update-screen-mark" aria-hidden="true">↻</div>
        <span class="eyebrow">VERITAS STUDIO</span>
        <h1 id="update-screen-title"></h1>
        <p id="update-screen-description"></p>
        <div class="update-progress-wrap"><div class="update-progress-track" role="progressbar" aria-label="Update download progress" aria-valuemin="0" aria-valuemax="100"><span id="update-progress-bar"></span></div><small id="update-screen-progress"></small></div>
        <div class="update-screen-actions"><button type="button" class="button-secondary" data-update-continue>Continue writing</button><button type="button" class="button-primary" data-update-install hidden>Restart and install</button></div>
      </section>`;
      screen.querySelector("[data-update-continue]").addEventListener("click", () => {
        state.updateScreenDismissed = true;
        screen.remove();
      });
      screen.querySelector("[data-update-install]").addEventListener("click", async event => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = "Restarting…";
        try {
          await desktop.installUpdate();
        } catch (error) {
          console.error("Could not install the downloaded update.", error);
          button.disabled = false;
          button.textContent = "Restart and install";
          notify(`Could not install update: ${error.message}`);
        }
      });
      document.body.append(screen);
    }
    const downloaded = update.status === "downloaded";
    const failed = update.status === "error";
    $("#update-screen-title", screen).textContent = downloaded
      ? "Your update is ready"
      : failed ? "Update couldn’t be completed" : "Veritas is updating";
    $("#update-screen-description", screen).textContent = downloaded
      ? `Version ${update.version} has been downloaded and is ready to install.`
      : failed ? update.message || "An unexpected error occurred while checking for or downloading the update."
        : `Version ${update.version || ""} is being downloaded. You can keep writing while the update downloads in the background.`;
    const progressTrack = $(".update-progress-track", screen);
    const progressBar = $("#update-progress-bar", screen);
    const progressLabel = $("#update-screen-progress", screen);
    progressBar.style.width = `${downloaded ? 100 : progress}%`;
    progressBar.classList.toggle("indeterminate", update.status === "available");
    if (update.status === "downloading" || downloaded) progressTrack.setAttribute("aria-valuenow", String(Math.round(progress)));
    else progressTrack.removeAttribute("aria-valuenow");
    progressLabel.textContent = downloaded
      ? "Download complete"
      : update.status === "downloading" && Number.isFinite(update.percent)
        ? `${Math.floor(update.percent)}%${update.total ? ` · ${formatBytes(update.transferred)} of ${formatBytes(update.total)}` : ""}`
        : failed ? "You can continue writing and try again later." : "Preparing download…";
    $(".update-progress-wrap", screen).hidden = failed;
    progressTrack.hidden = failed;
    progressLabel.hidden = failed;
    $("[data-update-install]", screen).hidden = !downloaded;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let unit = units[0];
    for (let index = 1; value >= 1024 && index < units.length; index++) {
      value /= 1024;
      unit = units[index];
    }
    return `${value.toFixed(1)} ${unit}`;
  }

  function applyUpdateState(update, showScreen = true) {
    if (!update || typeof update.status !== "string") return;
    state.updateState = update;
    const status = $("#update-check-status");
    if (status) status.textContent = updateStatusText(update);
    const viewButton = $("#view-update-screen");
    if (viewButton) viewButton.hidden = !["available", "downloading", "downloaded", "error"].includes(update.status);
    if (showScreen && ["available", "downloading", "downloaded"].includes(update.status) && !state.updateScreenDismissed) {
      renderUpdateScreen();
    } else if ($(".update-screen-backdrop")) {
      renderUpdateScreen();
    }
  }

  function setStatus(message) {
    $("#status-text").textContent = message;
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function loadProjectCatalog() {
    try {
      const catalog = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "null");
      if (catalog && Array.isArray(catalog.projects) && catalog.projects.length) {
        state.projects = catalog.projects;
        state.projectId = state.projects.some(project => project.id === catalog.activeId) ? catalog.activeId : state.projects[0].id;
      } else {
        const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        const id = `project-${crypto.randomUUID()}`;
        const name = legacy?.name || "The Cartographer's Silence";
        state.projects = [{ id, name, storage: "browser", modules: { ideation: false, writing: true, editing: false, publishing: false } }];
        state.projectId = id;
        if (legacy?.files?.length) localStorage.setItem(`${PROJECT_DATA_PREFIX}${id}`, JSON.stringify(legacy));
        else localStorage.setItem(`${PROJECT_DATA_PREFIX}${id}`, JSON.stringify({
          name, files: starterFiles.map(file => ({ ...file })),
          dailyGoal: DEFAULT_GOAL, dailyWords: 0, dayStartWords: 0, sessionStart: Date.now()
        }));
      }
      persistProjectCatalog();
      loadBrowserProject(state.projectId);
    } catch (error) {
      console.error("Could not load project catalog.", error);
      state.files = new Map(starterFiles.map(file => [file.path, file.content]));
      state.projectId = "recovery";
      state.projects = [{ id: state.projectId, name: "Recovery workspace", storage: "browser", modules: { writing: true } }];
      renderAll();
      notify("Could not load projects; opened a recovery workspace.");
    }
  }

  function loadBrowserProject(projectId) {
    const project = state.projects.find(item => item.id === projectId);
    if (!project) throw new Error("The selected project is no longer available.");
    state.projectId = project.id;
    state.dirHandle = null;
    state.files.clear();
    state.tabs = [];
    state.activePath = "";
    const saved = JSON.parse(localStorage.getItem(`${PROJECT_DATA_PREFIX}${project.id}`) || "null");
    state.files = new Map((saved?.files || []).map(file => [file.path, file.content]));
    let projectConfig = {};
    try { projectConfig = JSON.parse(state.files.get("config.json") || "{}"); }
    catch (error) { console.error("Could not parse project config.json.", error); notify("Project settings could not be loaded; using stored module settings."); }
    if (projectConfig.modules) project.modules = { ideation: false, writing: true, editing: false, publishing: false, ...project.modules, ...projectConfig.modules };
    if (!project.modules?.[state.currentModule]) state.currentModule = MODULES.find(module => project.modules?.[module.id])?.id || "writing";
    state.dailyGoal = Number(saved?.dailyGoal) || Number(projectConfig.dailyWordGoal) || DEFAULT_GOAL;
    state.dayStartWords = Number(saved?.dayStartWords) || 0;
    state.dailyWords = Number(saved?.dailyWords) || 0;
    state.sessionStart = Number(saved?.sessionStart) || Date.now();
    if (new Date(state.sessionStart).toDateString() !== new Date().toDateString()) {
      state.sessionStart = Date.now();
      state.dayStartWords = 0;
      state.dailyWords = 0;
    }
    if (!state.files.has("config.json")) state.files.set("config.json", JSON.stringify({ name: project.name, dailyWordGoal: DEFAULT_GOAL, version: 1, modules: project.modules }, null, 2));
    restoreMetrics();
    updateProjectLabels();
    persistBrowserState();
    renderAll();
    const firstFile = [...state.files.keys()].find(path => path.startsWith("Manuscript/")) || state.files.keys().find(path => path !== "config.json");
    if (firstFile) openFile(firstFile);
    else if (project.modules?.writing !== false) showEmptyEditor();
    else showModule("ideation");
  }

  function showEmptyEditor() {
    state.activePath = "";
    state.tabs = [];
    $("#document-title").value = "";
    $("#document-content").value = "";
    $("#rich-document-content").innerHTML = "";
    $("#rich-document-content").hidden = false;
    $("#document-content").hidden = true;
    $("#breadcrumb").textContent = "New project";
    renderTabs();
    updateStats();
    showModule("writing");
  }

  function persistProjectCatalog() {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify({ activeId: state.projectId, projects: state.projects }));
    renderModuleNavigation();
  }

  function activeProject() {
    return state.projects.find(project => project.id === state.projectId);
  }

  function updateProjectLabels() {
    const name = activeProject()?.name || "Untitled Project";
    $("#project-name").textContent = name;
    $("#binder-vault-name").textContent = name;
    $("#vault-mode").textContent = state.dirHandle ? (desktop ? "Windows folder" : "Local folder") : "Browser workspace";
  }

  function renderModuleNavigation() {
    const container = $("#module-nav");
    if (!container) return;
    container.replaceChildren();
    const modules = activeProject()?.modules || {};
    MODULES.filter(module => modules[module.id]).forEach(module => {
      const button = document.createElement("button");
      button.className = `module-nav-item${state.currentModule === module.id && state.currentView === "editor" ? " active" : ""}`;
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.currentModule === module.id && state.currentView === "editor"));
      button.innerHTML = `<span>${module.icon}</span>${module.name}`;
      button.addEventListener("click", () => showModule(module.id));
      container.append(button);
    });
    if (modules.writing) container.classList.toggle("has-writing-module", true);
    else container.classList.remove("has-writing-module");
    const todo = document.createElement("button");
    todo.className = `module-nav-item${state.currentView === "todo" ? " active" : ""}`;
    todo.type = "button";
    todo.setAttribute("aria-pressed", String(state.currentView === "todo"));
    todo.innerHTML = "<span>☑</span>To-do";
    todo.addEventListener("click", openTodoView);
    container.append(todo);
    if (modules.writing) {
      const planner = document.createElement("button");
      planner.className = `module-nav-item planner-nav-item${state.currentView === "planner" ? " active" : ""}`;
      planner.type = "button";
      planner.setAttribute("aria-pressed", String(state.currentView === "planner"));
      planner.innerHTML = "<span>⌁</span>Plot planner";
      planner.addEventListener("click", openPlotPlannerView);
      container.append(planner);
    }
  }

  function showModule(moduleId) {
    const project = activeProject();
    if (!project?.modules?.[moduleId]) {
      notify("Enable this module in Project settings to use it.");
      openProjectManager();
      return;
    }
    state.currentModule = moduleId;
    state.currentView = "editor";
    renderModuleNavigation();
    const lifecycle = $("#lifecycle-view");
    const writing = moduleId === "writing";
    lifecycle.hidden = writing;
    $("[data-panel=editor]").hidden = !writing;
    if (!writing) renderLifecycleModule(moduleId, lifecycle);
    applyModuleVisibility();
  }

  function openPlotPlannerView() {
    if (!activeProject()?.modules?.writing) return;
    state.currentModule = "writing";
    state.currentView = "planner";
    renderModuleNavigation();
    $("#lifecycle-view").hidden = false;
    $("[data-panel=editor]").hidden = true;
    renderPlotPlanner($("#lifecycle-view"));
    applyModuleVisibility();
  }

  function openTodoView() {
    state.currentView = "todo";
    renderModuleNavigation();
    $("#lifecycle-view").hidden = false;
    $("[data-panel=editor]").hidden = true;
    renderTodoList($("#lifecycle-view"));
    applyModuleVisibility();
  }

  function renderLifecycleModule(moduleId, container) {
    const modules = {
      ideation: renderIdeationModule,
      editing: renderEditingModule,
      publishing: renderPublishingModule,
      writing: renderPlotPlanner
    };
    modules[moduleId]?.(container);
  }

  function renderTodoList(container) {
    const data = readJsonFile("Todos/tasks.json", { items: [] });
    const items = Array.isArray(data.items) ? data.items : [];
    const remaining = items.filter(item => !item.done).length;
    container.innerHTML = `<header class="lifecycle-header"><div><span class="eyebrow">PROJECT TASKS</span><h1>To-do list</h1><p>Keep your next steps in one place, alongside your project.</p></div></header><div class="todo-board"><form class="todo-form"><input name="task" aria-label="New task" placeholder="What do you need to work on?" maxlength="240" required><button class="button-primary" type="submit">Add task</button></form><section class="module-card todo-card"><div class="module-card-heading"><div><span class="eyebrow">YOUR TASKS</span><h2>Work to do</h2></div><span class="stat-pill">${remaining} open · ${items.length} total</span></div><div class="todo-list">${items.length ? items.map(item => `<div class="todo-item${item.done ? " done" : ""}"><input id="todo-${escapeHtml(item.id)}" type="checkbox" data-todo-toggle="${escapeHtml(item.id)}" ${item.done ? "checked" : ""}><label for="todo-${escapeHtml(item.id)}">${escapeHtml(item.text)}</label><button type="button" class="todo-delete" data-todo-delete="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.text)}">×</button></div>`).join("") : '<div class="empty-hint">Nothing on your list yet. Add a task to get started.</div>'}</div></section></div>`;
    $(".todo-form", container).addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const input = $('input[name="task"]', form);
      const text = input.value.trim();
      if (!text) {
        notify("Enter a task before adding it.");
        input.focus();
        return;
      }
      items.push({ id: crypto.randomUUID(), text, done: false });
      await saveJsonFile("Todos/tasks.json", { items });
      renderTodoList(container);
    });
    $$("[data-todo-toggle]", container).forEach(input => input.addEventListener("change", async () => {
      const item = items.find(task => task.id === input.dataset.todoToggle);
      if (!item) return;
      item.done = input.checked;
      await saveJsonFile("Todos/tasks.json", { items });
      renderTodoList(container);
    }));
    $$("[data-todo-delete]", container).forEach(button => button.addEventListener("click", async () => {
      const index = items.findIndex(task => task.id === button.dataset.todoDelete);
      if (index < 0) return;
      items.splice(index, 1);
      await saveJsonFile("Todos/tasks.json", { items });
      renderTodoList(container);
    }));
  }

  function readJsonFile(path, fallback) {
    try { return JSON.parse(state.files.get(path) || "null") || structuredClone(fallback); }
    catch (error) {
      console.error(`Could not read ${path}.`, error);
      return structuredClone(fallback);
    }
  }

  async function saveJsonFile(path, value) {
    const content = JSON.stringify(value, null, 2);
    state.files.set(path, content);
    persistBrowserState();
    await writeVaultFileIfMounted(path, content);
    $("#vault-file-count").textContent = `${state.files.size} local files`;
  }

  function modulePage(moduleId, title, intro, actions = "") {
    const module = MODULES.find(item => item.id === moduleId);
    return `<header class="lifecycle-header"><div><span class="eyebrow">${module?.name.toUpperCase() || "WRITING"}</span><h1>${title}</h1><p>${intro}</p></div><div class="lifecycle-actions">${actions}</div></header><div class="lifecycle-content">`;
  }

  function compressMoodboardImage(file) {
    if (!file.type.startsWith("image/")) return Promise.reject(new Error("Choose an image file."));
    if (file.size > 20 * 1024 * 1024) return Promise.reject(new Error("Choose an image smaller than 20 MB."));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("Could not read the image file."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("This image could not be opened."));
        image.onload = () => {
          const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d");
          if (!context) { reject(new Error("Image processing is unavailable.")); return; }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function proofreadText(text) {
    const suggestions = [];
    const typoMap = { teh: "the", recieve: "receive", seperate: "separate", definately: "definitely", occured: "occurred", untill: "until", enviroment: "environment", wierd: "weird", goverment: "government", acheive: "achieve" };
    const rules = [
      { pattern: /\b(teh|recieve|seperate|definately|occured|untill|enviroment|wierd|goverment|acheive)\b/gi, replace: match => {
        const replacement = typoMap[match.toLowerCase()];
        if (match === match.toUpperCase()) return replacement.toUpperCase();
        return match[0] === match[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
      }, reason: "Common spelling typo" },
      { pattern: /\b([\p{L}]{2,})\s+\1\b/giu, replace: match => match.match(/^\S+/)[0], reason: "Repeated word" },
      { pattern: /[ \t]+([,.;:!?])/g, replace: match => match.trimStart(), reason: "Space before punctuation" },
      { pattern: /([,;:!?])\1+/g, replace: match => match[0], reason: "Repeated punctuation" }
    ];
    rules.forEach(rule => {
      for (const match of text.matchAll(rule.pattern)) {
        suggestions.push({
          start: match.index,
          end: match.index + match[0].length,
          match: match[0],
          replacement: rule.replace(match[0]),
          contextBefore: text.slice(Math.max(0, match.index - 35), match.index),
          contextAfter: text.slice(match.index + match[0].length, match.index + match[0].length + 35),
          reason: rule.reason
        });
      }
    });
    return suggestions.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function renderProofreadResults(container, suggestions) {
    const results = $("[data-proofread-results]", container);
    if (!suggestions.length) {
      results.innerHTML = '<div class="proofread-clear">✓ <span>No suggestions to review. Your manuscript was left untouched.</span></div>';
      return;
    }
    results.innerHTML = suggestions.map((item, index) => {
      return `<article class="proofread-suggestion"><div><span class="proofread-reason">${escapeHtml(item.reason)}</span><p>Replace <code>${escapeHtml(item.match)}</code> with <code>${escapeHtml(item.replacement)}</code></p><small>…${item.start > item.contextBefore.length ? "…" : ""}${escapeHtml(item.contextBefore)}<mark>${escapeHtml(item.match)}</mark>${escapeHtml(item.contextAfter)}…</small></div><button class="button-secondary" type="button" data-proofread-apply="${index}">Apply</button></article>`;
    }).join("");
  }

  function renderIdeationModule(container) {
    const source = readJsonFile("Ideation/ideas.json", { logline: "", premise: "", notes: "", cards: [], moodboard: [] });
    const ideas = {
      logline: String(source.logline || ""),
      premise: String(source.premise || ""),
      notes: String(source.notes || ""),
      cards: Array.isArray(source.cards) ? source.cards.filter(item => item && typeof item.id === "string") : [],
      moodboard: Array.isArray(source.moodboard) ? source.moodboard.filter(item => item && typeof item.id === "string" && typeof item.src === "string") : []
    };
    const tab = state.ideationTab;
    const controls = tab === "brainstorm"
      ? '<button class="button-primary" type="button" data-add-idea-card>＋ Add idea</button>'
      : tab === "moodboard"
        ? '<button class="button-secondary" type="button" data-add-mood-url>Add image URL</button><button class="button-primary" type="button" data-add-mood-file>＋ Add image</button>'
        : "";
    const body = tab === "seed"
      ? `<div class="module-card idea-card"><label>LOGLINE<textarea data-idea-field="logline" placeholder="A protagonist, an impossible goal, and what stands in the way…">${escapeHtml(ideas.logline)}</textarea></label><label>PREMISE & CENTRAL QUESTION<textarea data-idea-field="premise" placeholder="What is this story really about?">${escapeHtml(ideas.premise)}</textarea></label><label>CONCEPTUAL NOTES<textarea data-idea-field="notes" class="large-notes" placeholder="Capture questions, images, fragments, and possibilities…">${escapeHtml(ideas.notes)}</textarea></label><div class="module-save-state" data-idea-save-state>Saved locally</div></div>`
      : tab === "brainstorm"
        ? `<section class="idea-canvas" aria-label="Brainstorm board" style="--idea-rows:${Math.max(3, Math.ceil(ideas.cards.length / 3))}">${ideas.cards.length ? ideas.cards.map((card, index) => `<article class="idea-note" data-idea-card="${escapeHtml(card.id)}" style="left:${Math.max(0, Math.min(73, Number.isFinite(Number(card.x)) ? Number(card.x) : (4 + index % 3 * 31)))}%;top:${Math.max(0, Number.isFinite(Number(card.y)) ? Number(card.y) : (18 + Math.floor(index / 3) * 210))}px"><div class="idea-note-grip" data-card-grip="${escapeHtml(card.id)}" title="Drag card">⠿ <span>DRAG TO ARRANGE</span><button type="button" data-delete-idea="${escapeHtml(card.id)}" aria-label="Delete idea card">×</button></div><input data-card-title="${escapeHtml(card.id)}" aria-label="Idea title" maxlength="100" placeholder="A spark of an idea…" value="${escapeHtml(String(card.title || ""))}"><textarea data-card-body="${escapeHtml(card.id)}" aria-label="Idea details" placeholder="Explore a scenario, question, image, or possibility…">${escapeHtml(String(card.body || ""))}</textarea></article>`).join("") : '<div class="idea-canvas-empty">Start anywhere. Add a card for a possibility, a scene, a question, or a “what if?”</div>'}</section><div class="module-save-state" data-idea-save-state>Cards save as you work · drag by the handle to rearrange</div>`
        : `<section class="moodboard-grid">${ideas.moodboard.length ? ideas.moodboard.map(image => `<article class="moodboard-item"><img src="${escapeHtml(image.src)}" alt="${escapeHtml(String(image.caption || "Inspiration reference"))}"><input data-mood-caption="${escapeHtml(image.id)}" aria-label="Image caption" maxlength="180" placeholder="Add a note about this reference…" value="${escapeHtml(String(image.caption || ""))}"><button type="button" data-delete-mood="${escapeHtml(image.id)}" aria-label="Remove inspiration image">Remove</button></article>`).join("") : '<div class="moodboard-empty">Collect colors, imagery, places, textures, and visual references that capture the feeling of your story.</div>'}</section><p class="moodboard-note">Images are kept in this project. Add references you have permission to use.</p><div class="module-save-state" data-idea-save-state>Saved locally</div>`;
    container.innerHTML = `${modulePage("ideation", "The idea room", "Explore possibilities, collect visual references, and shape the seed of your story.", controls)}<nav class="ideation-tabs" aria-label="Ideation sections">${[["seed", "Story seed"], ["brainstorm", "Brainstorm"], ["moodboard", "Moodboard"]].map(([id, label]) => `<button type="button" data-idea-tab="${id}" class="${tab === id ? "active" : ""}" aria-pressed="${tab === id}">${label}${id === "brainstorm" && ideas.cards.length ? `<span>${ideas.cards.length}</span>` : ""}${id === "moodboard" && ideas.moodboard.length ? `<span>${ideas.moodboard.length}</span>` : ""}</button>`).join("")}</nav><div class="ideation-content">${body}</div></div>`;
    const saveIdeas = async () => {
      const indicator = $("[data-idea-save-state]", container);
      if (indicator) indicator.textContent = "Saving…";
      await saveJsonFile("Ideation/ideas.json", ideas);
      if (indicator?.isConnected) indicator.textContent = "Saved locally";
    };
    let timer;
    const captureSeedFields = () => {
      $$("[data-idea-field]", container).forEach(field => { ideas[field.dataset.ideaField] = field.value; });
    };
    const flushPendingSave = async () => {
      clearTimeout(timer);
      captureSeedFields();
      await saveIdeas();
    };
    $$("[data-idea-tab]", container).forEach(button => button.addEventListener("click", async () => {
      await flushPendingSave();
      state.ideationTab = button.dataset.ideaTab;
      renderIdeationModule(container);
    }));
    $$("[data-idea-field]", container).forEach(input => input.addEventListener("input", () => {
      ideas[input.dataset.ideaField] = input.value;
      clearTimeout(timer);
      $("[data-idea-save-state]", container).textContent = "Saving…";
      timer = setTimeout(() => void saveIdeas(), 350);
    }));
    $("[data-add-idea-card]", container)?.addEventListener("click", async () => {
      await flushPendingSave();
      const index = ideas.cards.length;
      ideas.cards.push({ id: crypto.randomUUID(), title: "", body: "", x: 4 + index % 3 * 31, y: 18 + Math.floor(index / 3) * 210 });
      await saveIdeas();
      renderIdeationModule(container);
      $("[data-card-title]", container)?.focus();
    });
    $$("[data-card-title],[data-card-body]", container).forEach(input => input.addEventListener("input", () => {
      const card = ideas.cards.find(item => item.id === (input.dataset.cardTitle || input.dataset.cardBody));
      if (!card) return;
      if (input.dataset.cardTitle) card.title = input.value;
      else card.body = input.value;
      clearTimeout(timer);
      timer = setTimeout(() => void saveIdeas(), 350);
    }));
    $$("[data-delete-idea]", container).forEach(button => button.addEventListener("click", async () => {
      await flushPendingSave();
      ideas.cards = ideas.cards.filter(card => card.id !== button.dataset.deleteIdea);
      await saveIdeas();
      renderIdeationModule(container);
    }));
    $$("[data-card-grip]", container).forEach(grip => grip.addEventListener("pointerdown", event => {
      if (event.target.closest("button")) return;
      const card = ideas.cards.find(item => item.id === grip.dataset.cardGrip);
      const board = $(".idea-canvas", container);
      if (!card || !board) return;
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      const rect = board.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const originX = Number(card.x) || 0;
      const originY = Number(card.y) || 0;
      const move = pointerEvent => {
        card.x = Math.max(0, Math.min(82, originX + (pointerEvent.clientX - startX) / rect.width * 100));
        card.y = Math.max(0, Math.min(rect.height - 185, originY + pointerEvent.clientY - startY));
        const note = $(`[data-idea-card="${CSS.escape(card.id)}"]`, container);
        if (note) { note.style.left = `${card.x}%`; note.style.top = `${card.y}px`; }
      };
      const finish = async () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", finish);
        grip.removeEventListener("pointercancel", finish);
        await saveIdeas();
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", finish, { once: true });
      grip.addEventListener("pointercancel", finish, { once: true });
    }));
    $("[data-add-mood-url]", container)?.addEventListener("click", async () => {
      const src = await promptDialog("Add an image reference", "Paste an image URL");
      if (!src) return;
      if (!/^https?:\/\//i.test(src.trim())) { notify("Enter an image URL beginning with http:// or https://."); return; }
      await flushPendingSave();
      ideas.moodboard.push({ id: crypto.randomUUID(), src: src.trim(), caption: "" });
      await saveIdeas();
      renderIdeationModule(container);
    });
    $("[data-add-mood-file]", container)?.addEventListener("click", () => {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "image/*";
      picker.addEventListener("change", async () => {
        const file = picker.files?.[0];
        if (!file) return;
        try {
          const src = await compressMoodboardImage(file);
          await flushPendingSave();
          ideas.moodboard.push({ id: crypto.randomUUID(), src, caption: file.name.replace(/\.[^.]+$/, "") });
          await saveIdeas();
          renderIdeationModule(container);
        } catch (error) {
          console.error("Could not add moodboard image.", error);
          notify(`Could not add image: ${error.message}`);
        }
      });
      picker.click();
    });
    $$("[data-mood-caption]", container).forEach(input => input.addEventListener("input", () => {
      const image = ideas.moodboard.find(item => item.id === input.dataset.moodCaption);
      if (!image) return;
      image.caption = input.value;
      clearTimeout(timer);
      timer = setTimeout(() => void saveIdeas(), 350);
    }));
    $$("[data-delete-mood]", container).forEach(button => button.addEventListener("click", async () => {
      ideas.moodboard = ideas.moodboard.filter(image => image.id !== button.dataset.deleteMood);
      await saveIdeas();
      renderIdeationModule(container);
    }));
  }

  function renderEditingModule(container) {
    const data = readJsonFile("Editing/revisions.json", { snapshots: [], checklist: [] });
    const checklist = data.checklist || [];
    const chapters = [...state.files.keys()].filter(path => /^Manuscript\/.+\.md$/i.test(path)).sort((a, b) => a.localeCompare(b));
    const selectedPath = chapters.includes(state.proofreadPath) ? state.proofreadPath : chapters.includes(state.activePath) ? state.activePath : chapters[0] || "";
    state.proofreadPath = selectedPath;
    const chapterOptions = chapters.map(path => `<option value="${escapeHtml(path)}" ${path === selectedPath ? "selected" : ""}>${escapeHtml(basename(path))}</option>`).join("");
    container.innerHTML = `${modulePage("editing", "Revision desk", "Track manuscript checkpoints, run a proofreading pass, and keep editorial focus visible.", '<button class="button-primary" data-save-revision>Save version snapshot</button>')}<section class="module-card proofreading-card"><div class="module-card-heading"><div><span class="eyebrow">PROOFREADING · RULE-BASED</span><h2>Proofreading pass</h2><p class="proofreading-intro">Catch common typos, repeated words, and punctuation slips. No AI or text is sent anywhere; review each suggestion before applying it.</p></div><button class="button-secondary" type="button" data-run-proofread ${chapters.length ? "" : "disabled"}>Check chapter</button></div><div class="proofreading-controls"><label for="proofread-chapter">CHAPTER</label><select id="proofread-chapter" ${chapters.length ? "" : "disabled"}>${chapterOptions || '<option value="">No manuscript chapters found</option>'}</select><span data-proofread-status>${chapters.length ? "Ready when you are" : "Add a Markdown chapter in Manuscript to get started."}</span></div><div class="proofreading-results" data-proofread-results><div class="empty-hint">Choose a chapter and run a check to see suggested corrections.</div></div></section><div class="module-grid"><section class="module-card"><div class="module-card-heading"><div><span class="eyebrow">REVISION HISTORY</span><h2>Snapshots</h2></div><span class="stat-pill">${data.snapshots.length} saved</span></div><div class="revision-list">${data.snapshots.length ? data.snapshots.map(item => `<article class="revision-item"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.date)} · ${item.words} words · ${escapeHtml(item.chapter || "No active chapter")}</small><p>${escapeHtml(item.note || "")}</p></article>`).join("") : '<div class="empty-hint">Save a snapshot before or after a revision pass.</div>'}</div></section><section class="module-card"><div class="module-card-heading"><div><span class="eyebrow">EDITORIAL PASSES</span><h2>Revision checklist</h2></div><button class="icon-button small" data-add-checklist title="Add checklist item">＋</button></div><div class="revision-checklist">${checklist.map((item, index) => `<label><input type="checkbox" data-check-index="${index}" ${item.done ? "checked" : ""}><span>${escapeHtml(item.text)}</span><button type="button" data-remove-check="${index}" aria-label="Remove item">×</button></label>`).join("") || '<div class="empty-hint">Add focused passes such as character arcs or continuity.</div>'}</div></section></div></div>`;
    $("#proofread-chapter", container)?.addEventListener("change", event => { state.proofreadPath = event.target.value; });
    $("[data-run-proofread]", container)?.addEventListener("click", async () => {
      if (state.dirty) await saveActiveFile();
      const path = $("#proofread-chapter", container).value;
      if (!path || !state.files.has(path)) { notify("Choose an available manuscript chapter first."); return; }
      state.proofreadPath = path;
      const results = proofreadText(state.files.get(path));
      const status = $("[data-proofread-status]", container);
      status.textContent = results.length ? `${results.length} suggestion${results.length === 1 ? "" : "s"} · nothing changed yet` : "No common issues found · your text was not changed";
      renderProofreadResults(container, results);
    });
    $("[data-proofread-results]", container).addEventListener("click", async event => {
      const button = event.target.closest("[data-proofread-apply]");
      if (!button) return;
      const path = state.proofreadPath;
      const content = state.files.get(path);
      const index = Number(button.dataset.proofreadApply);
      const result = proofreadText(content)[index];
      if (!result || content.slice(result.start, result.end) !== result.match) {
        notify("This suggestion is out of date. Run the check again before applying it.");
        return;
      }
      state.files.set(path, `${content.slice(0, result.start)}${result.replacement}${content.slice(result.end)}`);
      if (path === state.activePath) {
        $("#document-content").value = state.files.get(path);
        renderMarkdownEditor(state.files.get(path));
        state.lastWordCount = words(editorBodyText());
        updateStats();
      }
      await saveJsonFile(path, state.files.get(path));
      const updated = proofreadText(state.files.get(path));
      $("[data-proofread-status]", container).textContent = updated.length ? `${updated.length} suggestion${updated.length === 1 ? "" : "s"} remaining · one correction applied` : "Correction applied · no common issues remain";
      renderProofreadResults(container, updated);
      notify("Proofreading correction applied");
    });
    $("[data-save-revision]", container).addEventListener("click", () => void saveRevisionSnapshot(data, container));
    $("[data-add-checklist]", container).addEventListener("click", async () => {
      const text = await promptDialog("Add revision pass", "e.g. Check character motivations");
      if (!text) return;
      data.checklist.push({ text, done: false });
      await saveJsonFile("Editing/revisions.json", data);
      renderEditingModule(container);
    });
    $$("[data-check-index]", container).forEach(input => input.addEventListener("change", () => {
      data.checklist[Number(input.dataset.checkIndex)].done = input.checked;
      void saveJsonFile("Editing/revisions.json", data);
    }));
    $$("[data-remove-check]", container).forEach(button => button.addEventListener("click", () => {
      data.checklist.splice(Number(button.dataset.removeCheck), 1);
      void saveJsonFile("Editing/revisions.json", data);
      renderEditingModule(container);
    }));
  }

  async function saveRevisionSnapshot(data, container) {
    await saveActiveFile();
    const label = await promptDialog("Save version snapshot", "Snapshot name (e.g. First structural pass)");
    if (!label) return;
    const content = state.files.get(state.activePath) || "";
    data.snapshots.unshift({ id: crypto.randomUUID(), label, date: new Date().toLocaleString(), chapter: state.activePath ? basename(state.activePath) : "", words: words(content), content, note: "" });
    await saveJsonFile("Editing/revisions.json", data);
    renderEditingModule(container);
    notify("Revision snapshot saved");
  }

  function readPublishingPortfolio() {
    const source = readJsonFile("Publishing/portfolio.json", { books: [], expenses: [], earnings: [], activeBookId: "" });
    const books = Array.isArray(source.books) ? source.books.filter(book => book && typeof book.id === "string").map(book => ({
      id: book.id,
      title: String(book.title || ""),
      subtitle: String(book.subtitle || ""),
      isbn: String(book.isbn || ""),
      publisher: String(book.publisher || ""),
      format: String(book.format || ""),
      releaseDate: String(book.releaseDate || ""),
      status: String(book.status || "In progress"),
      blurb: String(book.blurb || ""),
      pitch: String(book.pitch || "")
    })) : [];
    const entries = key => Array.isArray(source[key]) ? source[key].filter(entry =>
      entry && typeof entry.id === "string" && typeof entry.bookId === "string" &&
      Number.isFinite(Number(entry.amount)) && Number(entry.amount) >= 0
    ).map(entry => ({ ...entry, amount: Number(entry.amount) })) : [];
    const activeBookId = books.some(book => book.id === source.activeBookId) ? source.activeBookId : books[0]?.id || "";
    return { books, expenses: entries("expenses"), earnings: entries("earnings"), activeBookId };
  }

  function publishingMoney(amount) {
    return new Intl.NumberFormat(navigator.language || "en-US", { style: "currency", currency: "USD" }).format(amount);
  }

  function publishingDate(value) {
    if (!value) return "No date";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(navigator.language || "en-US", { dateStyle: "medium" }).format(date);
  }

  function localDateInputValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function renderPublishingModule(container) {
    const launch = readJsonFile("Publishing/launch.json", { plan: "", bio: "", checklist: [] });
    if (!Array.isArray(launch.checklist)) launch.checklist = [];
    const portfolio = readPublishingPortfolio();
    const book = portfolio.books.find(item => item.id === portfolio.activeBookId);
    const tab = ["overview", "books", "finance", "marketing"].includes(state.publishingTab) ? state.publishingTab : "overview";
    state.publishingTab = tab;
    const tabs = [["overview", "Overview"], ["books", "Book details"], ["finance", "Finances"], ["marketing", "Marketing copy"]];
    const bookOptions = portfolio.books.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === portfolio.activeBookId ? "selected" : ""}>${escapeHtml(item.title || "Untitled book")}</option>`).join("");
    let content = "";

    if (tab === "overview") {
      const totals = portfolio.books.map(item => {
        const spent = portfolio.expenses.filter(entry => entry.bookId === item.id).reduce((sum, entry) => sum + entry.amount, 0);
        const earned = portfolio.earnings.filter(entry => entry.bookId === item.id).reduce((sum, entry) => sum + entry.amount, 0);
        return { ...item, spent, earned, profit: earned - spent };
      });
      const investment = totals.reduce((sum, item) => sum + item.spent, 0);
      const earnings = totals.reduce((sum, item) => sum + item.earned, 0);
      content = `<div class="publishing-stats"><article class="publishing-stat"><span>BOOKS TRACKED</span><strong>${portfolio.books.length}</strong></article><article class="publishing-stat"><span>INVESTMENT</span><strong>${publishingMoney(investment)}</strong></article><article class="publishing-stat"><span>RECORDED EARNINGS</span><strong>${publishingMoney(earnings)}</strong></article><article class="publishing-stat"><span>PORTFOLIO PROFIT</span><strong class="${earnings - investment >= 0 ? "profit-positive" : "profit-negative"}">${publishingMoney(earnings - investment)}</strong></article></div><section class="module-card publishing-overview-card"><div class="module-card-heading"><div><span class="eyebrow">BOOK PERFORMANCE</span><h2>Profitability by book</h2></div><span class="stat-pill">Earnings − investment</span></div>${totals.length ? `<div class="publishing-table-wrap"><table class="publishing-table"><thead><tr><th>Book</th><th>Investment</th><th>Earnings</th><th>Profit / loss</th><th>Return</th></tr></thead><tbody>${totals.map(item => `<tr><td><button type="button" class="publishing-book-link" data-publishing-book="${escapeHtml(item.id)}">${escapeHtml(item.title || "Untitled book")}</button><small>${escapeHtml(item.status)}</small></td><td>${publishingMoney(item.spent)}</td><td>${publishingMoney(item.earned)}</td><td class="${item.profit >= 0 ? "profit-positive" : "profit-negative"}">${publishingMoney(item.profit)}</td><td>${item.spent ? `${((item.profit / item.spent) * 100).toFixed(1)}%` : "—"}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-hint publishing-empty">Add a book to start tracking its metadata, marketing, expenses, and earnings.</div>'}</section>`;
    } else if (tab === "books") {
      content = book ? `<section class="module-card publishing-form-card"><div class="module-card-heading"><div><span class="eyebrow">BOOK RECORD</span><h2>${escapeHtml(book.title || "Untitled book")}</h2></div><span class="stat-pill">${escapeHtml(book.status)}</span></div><div class="publishing-form-grid"><label>Title<input data-book-field="title" value="${escapeHtml(book.title)}" placeholder="Book title"></label><label>Subtitle<input data-book-field="subtitle" value="${escapeHtml(book.subtitle)}" placeholder="Optional subtitle"></label><label>ISBN<input data-book-field="isbn" value="${escapeHtml(book.isbn)}" placeholder="ISBN-13"></label><label>Publisher / imprint<input data-book-field="publisher" value="${escapeHtml(book.publisher)}" placeholder="Publisher or imprint"></label><label>Format<input data-book-field="format" value="${escapeHtml(book.format)}" placeholder="Paperback, ebook, audiobook…"></label><label>Release date<input data-book-field="releaseDate" type="date" value="${escapeHtml(book.releaseDate)}"></label><label>Status<select data-book-field="status">${["In progress", "Upcoming", "Published", "On hold"].map(status => `<option ${status === book.status ? "selected" : ""}>${status}</option>`).join("")}</select></label></div><div class="module-save-state" data-publishing-save-state>Saved locally</div></section>` : '<section class="module-card publishing-empty"><span class="eyebrow">YOUR CATALOG</span><h2>No books yet</h2><p>Add a book to keep its publishing details and performance in one place.</p><button class="button-primary" data-add-book>Add a book</button></section>';
    } else if (tab === "finance") {
      const expenses = portfolio.expenses.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      const earnings = portfolio.earnings.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      const expenseRows = expenses.map(entry => `<tr><td>${publishingDate(entry.date)}</td><td>${escapeHtml(portfolio.books.find(item => item.id === entry.bookId)?.title || "Unknown book")}</td><td>${escapeHtml(entry.category || "Other")}</td><td>${escapeHtml(entry.description || "")}</td><td>${publishingMoney(entry.amount)}</td><td><button type="button" class="publishing-delete" data-delete-entry="expense:${escapeHtml(entry.id)}" aria-label="Delete expense">×</button></td></tr>`).join("");
      const earningRows = earnings.map(entry => `<tr><td>${publishingDate(entry.date)}</td><td>${escapeHtml(portfolio.books.find(item => item.id === entry.bookId)?.title || "Unknown book")}</td><td>${escapeHtml(entry.source || "Other")}</td><td>${Number(entry.units) > 0 ? `${Number(entry.units)} units` : "—"}</td><td>${publishingMoney(entry.amount)}</td><td><button type="button" class="publishing-delete" data-delete-entry="earning:${escapeHtml(entry.id)}" aria-label="Delete earnings entry">×</button></td></tr>`).join("");
      const expenseCategories = ["Cover art / design", "Editing", "Proofreading", "Marketing", "Formatting", "ISBN / distribution", "Other"];
      const earningSources = ["Royalties", "Book sales", "Advance", "Direct sales", "Other"];
      content = portfolio.books.length ? `<div class="publishing-finance-forms"><form class="module-card publishing-entry-form" data-entry-form="expense"><span class="eyebrow">TRACK INVESTMENT</span><h2>Add an expense</h2><label>Book<select name="bookId">${bookOptions}</select></label><div class="publishing-inline-fields"><label>Date<input name="date" type="date" value="${localDateInputValue()}" required></label><label>Category<select name="category">${expenseCategories.map(value => `<option>${value}</option>`).join("")}</select></label></div><label>Description<input name="description" maxlength="180" placeholder="e.g. Cover illustration deposit"></label><label>Amount (USD)<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required></label><button class="button-primary" type="submit">Log expense</button></form><form class="module-card publishing-entry-form" data-entry-form="earning"><span class="eyebrow">TRACK SALES & ROYALTIES</span><h2>Add earnings</h2><label>Book<select name="bookId">${bookOptions}</select></label><div class="publishing-inline-fields"><label>Date<input name="date" type="date" value="${localDateInputValue()}" required></label><label>Source<select name="source">${earningSources.map(value => `<option>${value}</option>`).join("")}</select></label></div><div class="publishing-inline-fields"><label>Units sold (optional)<input name="units" type="number" min="0" step="1" placeholder="0"></label><label>Total earnings (USD)<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required></label></div><button class="button-primary" type="submit">Log earnings</button></form></div><section class="module-card publishing-ledger"><div class="module-card-heading"><div><span class="eyebrow">OUTGOING</span><h2>Expenses</h2></div><span class="stat-pill">${expenses.length} records</span></div>${expenses.length ? `<div class="publishing-table-wrap"><table class="publishing-table"><thead><tr><th>Date</th><th>Book</th><th>Category</th><th>Description</th><th>Amount</th><th></th></tr></thead><tbody>${expenseRows}</tbody></table></div>` : '<div class="empty-hint">Expenses you log will appear here.</div>'}</section><section class="module-card publishing-ledger"><div class="module-card-heading"><div><span class="eyebrow">INCOMING</span><h2>Earnings</h2></div><span class="stat-pill">${earnings.length} records</span></div>${earnings.length ? `<div class="publishing-table-wrap"><table class="publishing-table"><thead><tr><th>Date</th><th>Book</th><th>Source</th><th>Units</th><th>Amount</th><th></th></tr></thead><tbody>${earningRows}</tbody></table></div>` : '<div class="empty-hint">Sales and royalty records will appear here.</div>'}</section>` : '<section class="module-card publishing-empty"><h2>Add a book to get started</h2><p>Every expense and earnings record is attached to a book.</p><button class="button-primary" data-add-book>Add a book</button></section>';
    } else {
      content = `<div class="publishing-marketing-grid"><section class="module-card idea-card publishing-copy-card"><span class="eyebrow">AUTHOR PROFILE</span><h2>Author bio</h2><label>ABOUT THE AUTHOR<textarea data-launch-field="bio" placeholder="A short, ready-to-use biography for retailers, press, and event organizers…">${escapeHtml(launch.bio || "")}</textarea></label><div class="module-save-state" data-launch-save-state>Saved locally</div></section><section class="module-card idea-card publishing-copy-card"><span class="eyebrow">BOOK COPY${book ? ` · ${escapeHtml(book.title || "Untitled book")}` : ""}</span><h2>Pitch & description</h2>${book ? `<label>Elevator pitch<textarea data-book-copy="pitch" placeholder="A concise one- or two-sentence pitch…">${escapeHtml(book.pitch)}</textarea></label><label>Book blurb<textarea data-book-copy="blurb" placeholder="The description readers will see on the back cover and retailer pages…">${escapeHtml(book.blurb)}</textarea></label><div class="module-save-state" data-publishing-save-state>Saved locally</div>` : '<div class="empty-hint">Add a book to save its elevator pitch and blurb.</div>'}</section><section class="module-card idea-card publishing-copy-card"><span class="eyebrow">CAMPAIGN PLANNING</span><h2>Launch notes</h2><label>Audience, comparable titles, channels, and campaign ideas<textarea data-launch-field="plan" class="publishing-plan" placeholder="Capture your positioning and launch strategy…">${escapeHtml(launch.plan || "")}</textarea></label><div class="module-save-state" data-launch-save-state>Saved locally</div></section><section class="module-card publishing-copy-card"><div class="module-card-heading"><div><span class="eyebrow">RELEASE READINESS</span><h2>Launch checklist</h2></div><button class="icon-button small" data-add-launch title="Add checklist item">＋</button></div><div class="revision-checklist">${launch.checklist.map((item, index) => `<label><input type="checkbox" data-launch-check="${index}" ${item.done ? "checked" : ""}><span>${escapeHtml(String(item.text || ""))}</span><button type="button" data-remove-launch="${index}" aria-label="Remove item">×</button></label>`).join("") || '<div class="empty-hint">Build a release checklist for your project.</div>'}</div></section></div>`;
    }

    container.innerHTML = `${modulePage("publishing", "Publishing studio", "Manage your catalog, marketing materials, publishing costs, and book performance.", '<button class="button-secondary" data-publish-export>Open export settings</button><button class="button-primary" data-add-book>Add a book</button>')}<nav class="publishing-tabs" aria-label="Publishing tools" role="tablist">${tabs.map(([id, label]) => `<button type="button" role="tab" aria-selected="${tab === id}" class="${tab === id ? "active" : ""}" data-publishing-tab="${id}">${label}</button>`).join("")}</nav><div class="lifecycle-content publishing-content">${content}</div>`;

    $$("[data-publishing-tab]", container).forEach(button => button.addEventListener("click", () => {
      state.publishingTab = button.dataset.publishingTab;
      renderPublishingModule(container);
    }));
    $("[data-publish-export]", container).addEventListener("click", () => openExportDialog({ scope: "manuscript" }));
    $$(".publishing-empty [data-add-book], [data-add-book]", container).forEach(button => button.addEventListener("click", () => void addPublishingBook(container, portfolio)));
    $$("[data-publishing-book]", container).forEach(button => button.addEventListener("click", async () => {
      portfolio.activeBookId = button.dataset.publishingBook;
      await saveJsonFile("Publishing/portfolio.json", portfolio);
      state.publishingTab = "books";
      renderPublishingModule(container);
    }));

    const bookFields = $$("[data-book-field], [data-book-copy]", container);
    if (book && bookFields.length) {
      let timer;
      bookFields.forEach(input => input.addEventListener("input", () => {
        const field = input.dataset.bookField || input.dataset.bookCopy;
        book[field] = input.value;
        clearTimeout(timer);
        $("[data-publishing-save-state]", container).textContent = "Saving…";
        timer = setTimeout(async () => {
          await saveJsonFile("Publishing/portfolio.json", portfolio);
          const saveState = $("[data-publishing-save-state]", container);
          if (saveState) saveState.textContent = "Saved locally";
        }, 350);
      }));
    }

    const launchFields = $$("[data-launch-field]", container);
    if (launchFields.length) {
      let timer;
      launchFields.forEach(input => input.addEventListener("input", () => {
        launch[input.dataset.launchField] = input.value;
        clearTimeout(timer);
        $$("[data-launch-save-state]", container).forEach(status => { status.textContent = "Saving…"; });
        timer = setTimeout(async () => {
          await saveJsonFile("Publishing/launch.json", launch);
          $$("[data-launch-save-state]", container).forEach(status => { status.textContent = "Saved locally"; });
        }, 350);
      }));
    }

    $$("[data-entry-form]", container).forEach(form => form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form));
      const amount = Number(values.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        notify("Enter an amount greater than zero.");
        return;
      }
      if (form.dataset.entryForm === "expense") {
        portfolio.expenses.push({ id: crypto.randomUUID(), bookId: String(values.bookId), date: String(values.date), category: String(values.category), description: String(values.description || "").trim(), amount });
      } else {
        portfolio.earnings.push({ id: crypto.randomUUID(), bookId: String(values.bookId), date: String(values.date), source: String(values.source), units: Number(values.units) || 0, amount });
      }
      await saveJsonFile("Publishing/portfolio.json", portfolio);
      renderPublishingModule(container);
      notify(form.dataset.entryForm === "expense" ? "Expense recorded" : "Earnings recorded");
    }));

    $$("[data-delete-entry]", container).forEach(button => button.addEventListener("click", async () => {
      const [type, id] = button.dataset.deleteEntry.split(":");
      const records = type === "expense" ? portfolio.expenses : portfolio.earnings;
      const index = records.findIndex(entry => entry.id === id);
      if (index < 0) return;
      records.splice(index, 1);
      await saveJsonFile("Publishing/portfolio.json", portfolio);
      renderPublishingModule(container);
    }));

    $$("[data-launch-check]", container).forEach(input => input.addEventListener("change", async () => {
      launch.checklist[Number(input.dataset.launchCheck)].done = input.checked;
      await saveJsonFile("Publishing/launch.json", launch);
    }));
    $$("[data-remove-launch]", container).forEach(button => button.addEventListener("click", async () => {
      launch.checklist.splice(Number(button.dataset.removeLaunch), 1);
      await saveJsonFile("Publishing/launch.json", launch);
      renderPublishingModule(container);
    }));
    $("[data-add-launch]", container)?.addEventListener("click", async () => {
      const text = await promptDialog("Add launch task", "e.g. Prepare advance reader copies");
      if (!text) return;
      launch.checklist.push({ text, done: false });
      await saveJsonFile("Publishing/launch.json", launch);
      renderPublishingModule(container);
    });
  }

  async function addPublishingBook(container, portfolio) {
    const title = await promptDialog("Add a book", "Book title");
    if (!title) return;
    const book = { id: crypto.randomUUID(), title: title.trim(), subtitle: "", isbn: "", publisher: "", format: "", releaseDate: "", status: "In progress", blurb: "", pitch: "" };
    portfolio.books.push(book);
    portfolio.activeBookId = book.id;
    await saveJsonFile("Publishing/portfolio.json", portfolio);
    state.publishingTab = "books";
    renderPublishingModule(container);
  }

  function readPlotPlanner() {
    const data = readJsonFile("Timelines/Plot planner.json", { threads: [{ id: "main", name: "Main plot", color: "accent" }], events: [], arcs: [] });
    data.threads ||= [{ id: "main", name: "Main plot", color: "accent" }];
    data.events ||= [];
    data.arcs ||= [];
    return data;
  }

  function renderPlotPlanner(container = $("#lifecycle-view")) {
    const data = readPlotPlanner();
    const threads = data.threads;
    const visibleThreads = state.plotThread === "all" ? threads : threads.filter(thread => thread.id === state.plotThread);
    const actionButtons = '<button class="button-secondary" data-add-thread>＋ Plot thread</button><button class="button-secondary" data-add-arc>＋ Story arc</button><button class="button-primary" data-add-plot-event>＋ Event block</button>';
    container.innerHTML = `${modulePage("writing", "Plot planner", "Map story events by narrative thread, then switch between surface and shadow layers.", actionButtons)}<div class="plot-controls"><div class="plot-thread-filters"><button class="filter-chip${state.plotThread === "all" ? " active" : ""}" data-thread-filter="all">All threads</button>${threads.map(thread => `<button class="filter-chip${state.plotThread === thread.id ? " active" : ""}" data-thread-filter="${escapeHtml(thread.id)}">${escapeHtml(thread.name)}</button>`).join("")}</div><div class="layer-switch"><button class="filter-chip${state.plotLayer === "surface" ? " active" : ""}" data-layer="surface">◉ Surface</button><button class="filter-chip${state.plotLayer === "shadow" ? " active" : ""}" data-layer="shadow">◌ Shadow</button></div></div><section class="plot-board"><div class="plot-time-axis"><span>STORY ORDER</span><div><i>Beginning</i><i>Middle</i><i>End</i></div></div><div class="plot-arcs">${data.arcs.filter(arc => state.plotThread === "all" || arc.thread === state.plotThread).map(arc => `<div class="plot-arc-row"><span class="plot-lane-label">ARC</span><div class="plot-arc-track"><div class="plot-arc-bar" style="--arc-start:${Number(arc.start) || 0}%;--arc-span:${Math.max(8, (Number(arc.end) || 40) - (Number(arc.start) || 0))}%" title="${escapeHtml(arc.description || "")}"><span>${escapeHtml(arc.name)}</span></div></div><button class="plot-delete" data-delete-arc="${escapeHtml(arc.id)}" title="Remove arc">×</button></div>`).join("")}</div><div class="plot-lanes">${visibleThreads.map(thread => `<div class="plot-lane" data-plot-lane="${escapeHtml(thread.id)}"><div class="plot-lane-label"><span class="thread-dot ${escapeHtml(thread.color || "accent")}"></span><strong>${escapeHtml(thread.name)}</strong><small>${data.events.filter(event => event.thread === thread.id && (event.layer || "surface") === state.plotLayer).length} blocks</small></div><div class="plot-lane-track" data-lane-track="${escapeHtml(thread.id)}">${data.events.filter(event => event.thread === thread.id && (event.layer || "surface") === state.plotLayer).sort((a,b) => a.position - b.position).map(event => `<article class="plot-event-card ${escapeHtml(event.type || "event")}" style="--plot-col:${Math.max(1, Math.min(18, Math.round(Number(event.position || 0) / 5) + 1))}" draggable="true" data-plot-event="${escapeHtml(event.id)}" title="${escapeHtml(event.description || "Drag to reorder or move to another thread")}"><small>${escapeHtml(event.marker || `Beat ${Math.round(event.position / 10)}`)}</small><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.summary || "")}</span><button type="button" data-delete-event="${escapeHtml(event.id)}" title="Delete event">×</button></article>`).join("") || '<div class="plot-lane-empty">Drop an event here or add a block</div>'}</div></div>`).join("")}</div></section><div class="plot-footer"><span>Drag event blocks between threads or along the story.</span><span>${data.events.length} events · ${data.arcs.length} arcs</span></div></div>`;
    bindPlotPlanner(container, data);
  }

  function bindPlotPlanner(container, data) {
    const saveAndRender = async () => { await saveJsonFile("Timelines/Plot planner.json", data); renderPlotPlanner(container); };
    $$("[data-layer]", container).forEach(button => button.addEventListener("click", () => { state.plotLayer = button.dataset.layer; renderPlotPlanner(container); }));
    $$("[data-thread-filter]", container).forEach(button => button.addEventListener("click", () => { state.plotThread = button.dataset.threadFilter; renderPlotPlanner(container); }));
    $("[data-add-plot-event]", container).addEventListener("click", () => void openPlotItemDialog("event", data, saveAndRender));
    $("[data-add-arc]", container).addEventListener("click", () => void openPlotItemDialog("arc", data, saveAndRender));
    $("[data-add-thread]", container).addEventListener("click", async () => {
      const name = await promptDialog("Create plot thread", "Thread name (e.g. The hidden conspiracy)");
      if (!name) return;
      data.threads.push({ id: crypto.randomUUID(), name, color: ["accent", "blue", "green", "rose"][data.threads.length % 4] });
      await saveAndRender();
    });
    $$("[data-delete-event]", container).forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      data.events = data.events.filter(item => item.id !== button.dataset.deleteEvent);
      void saveAndRender();
    }));
    $$("[data-delete-arc]", container).forEach(button => button.addEventListener("click", () => {
      data.arcs = data.arcs.filter(item => item.id !== button.dataset.deleteArc);
      void saveAndRender();
    }));
    $$(".plot-event-card", container).forEach(card => {
      card.addEventListener("dragstart", event => {
        state.plannerDragging = card.dataset.plotEvent;
        event.dataTransfer.setData("text/plain", state.plannerDragging);
        event.dataTransfer.effectAllowed = "move";
      });
    });
    $$(".plot-lane-track", container).forEach(track => {
      track.addEventListener("dragover", event => event.preventDefault());
      track.addEventListener("drop", event => {
        event.preventDefault();
        const eventId = event.dataTransfer.getData("text/plain") || state.plannerDragging;
        const plotEvent = data.events.find(item => item.id === eventId);
        if (!plotEvent) return;
        const bounds = track.getBoundingClientRect();
        plotEvent.thread = track.dataset.laneTrack;
        plotEvent.position = Math.max(0, Math.min(100, Math.round(((event.clientX - bounds.left) / bounds.width) * 100)));
        void saveAndRender();
      });
    });
  }

  async function openPlotItemDialog(kind, data, onSave) {
    const isEvent = kind === "event";
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop plot-item-backdrop";
    const threads = data.threads.map(thread => `<option value="${escapeHtml(thread.id)}">${escapeHtml(thread.name)}</option>`).join("");
    backdrop.innerHTML = `<form class="dialog-card plot-item-dialog"><header class="modal-heading"><div><span class="eyebrow">PLOT PLANNER</span><h3>${isEvent ? "Add event block" : "Add story arc"}</h3></div><button type="button" class="icon-button small" data-close>×</button></header><div class="plot-form-fields"><label>${isEvent ? "EVENT TITLE" : "ARC NAME"}<input required name="title" placeholder="${isEvent ? "What happens in this beat?" : "Name the arc"}"></label>${isEvent ? `<label>THREAD<select name="thread">${threads}</select></label><label>LAYER<select name="layer"><option value="${state.plotLayer}">${state.plotLayer === "surface" ? "Surface" : "Shadow"}</option><option value="${state.plotLayer === "surface" ? "shadow" : "surface"}">${state.plotLayer === "surface" ? "Shadow" : "Surface"}</option></select></label><label>STORY POSITION <input name="position" type="range" min="0" max="100" value="50"><span class="range-hint">Beginning ← → End</span></label><label>SHORT SUMMARY<textarea name="summary" rows="3" placeholder="Optional note for this story beat"></textarea></label>` : `<label>ARC THREAD<select name="thread">${threads}</select></label><div class="plot-range-row"><label>START <input name="start" type="number" min="0" max="100" value="15"></label><label>END <input name="end" type="number" min="1" max="100" value="70"></label></div><label>ARC NOTES<textarea name="description" rows="3" placeholder="What changes over the course of this arc?"></textarea></label>`}</div><footer class="dialog-actions"><button type="button" data-cancel>Cancel</button><button type="submit" class="primary">Add ${isEvent ? "event" : "arc"}</button></footer></form>`;
    const finish = value => { backdrop.remove(); return value; };
    $("[data-close]", backdrop).addEventListener("click", () => finish(null));
    $("[data-cancel]", backdrop).addEventListener("click", () => finish(null));
    backdrop.addEventListener("click", event => { if (event.target === backdrop) finish(null); });
    $("form", backdrop).addEventListener("submit", event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (isEvent) data.events.push({ id: crypto.randomUUID(), title: String(form.get("title")).trim(), thread: form.get("thread"), layer: form.get("layer"), position: Number(form.get("position")), summary: String(form.get("summary")).trim(), marker: `Beat ${Math.round(Number(form.get("position")) / 10)}`, type: "event" });
      else data.arcs.push({ id: crypto.randomUUID(), name: String(form.get("title")).trim(), thread: form.get("thread"), start: Number(form.get("start")), end: Number(form.get("end")), description: String(form.get("description")).trim() });
      finish(true);
      void onSave();
    });
    document.body.append(backdrop);
    $("input", backdrop).focus();
  }

  function persistBrowserState() {
    try {
      localStorage.setItem(`${PROJECT_DATA_PREFIX}${state.projectId || "legacy"}`, JSON.stringify({
        name: activeProject()?.name || $("#project-name").textContent,
        files: [...state.files].map(([path, content]) => ({ path, content })),
        dailyGoal: state.dailyGoal,
        dayStartWords: state.dayStartWords,
        dailyWords: state.dailyWords,
        sessionStart: state.sessionStart
      }));
    } catch (error) {
      console.error("Could not persist browser vault.", error);
      setStatus("Browser storage unavailable");
    }
  }

  function renderAll() {
    renderBinder();
    renderTimeline();
    renderRelatedLore();
    $("#vault-file-count").textContent = `${state.files.size} local files`;
    renderModuleNavigation();
    applyModuleVisibility();
  }

  function applyModuleVisibility() {
    const focused = state.currentModule !== "writing" || state.currentView !== "editor";
    document.body.classList.toggle("module-focus", focused);
  }

  function openProjectManager() {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop project-backdrop";
    const currentProject = activeProject();
    const projects = state.projects.map(project => `
      <article class="project-card${project.id === state.projectId ? " selected" : ""}">
        <div class="project-card-main"><span class="project-card-icon">▧</span><div><strong>${escapeHtml(project.name)}</strong><small>${project.storage === "folder" ? "Local folder" : "Browser workspace"} · ${project.id === state.projectId ? "Current project" : "Project workspace"}</small></div></div>
        <button class="button-secondary" type="button" data-switch-project="${escapeHtml(project.id)}" ${project.id === state.projectId ? "disabled" : ""}>${project.id === state.projectId ? "Open" : "Switch"}</button>
        <div class="project-modules">${MODULES.map(module => `<label><input type="checkbox" data-project-module="${module.id}" data-project-id="${escapeHtml(project.id)}" ${project.modules?.[module.id] ? "checked" : ""}><span>${module.name}</span></label>`).join("")}</div>
      </article>`).join("");
    backdrop.innerHTML = `<section class="project-manager dialog-card" role="dialog" aria-modal="true" aria-labelledby="project-manager-title">
      <header class="modal-heading"><div><span class="eyebrow">WORKSPACES</span><h3 id="project-manager-title">Your projects</h3></div><button class="icon-button small" type="button" data-close-manager aria-label="Close">×</button></header>
      <p class="modal-intro">Keep each novel's manuscript, planning, and module settings in its own workspace.</p>
      <div class="project-manager-list">${projects || '<div class="empty-hint">No projects yet. Create your first writing workspace.</div>'}</div>
      <footer class="project-manager-actions"><button class="button-secondary" type="button" data-import-project>Import project</button><button class="button-secondary" type="button" data-export-project>Export project</button><button class="button-secondary" type="button" data-create-project="browser">＋ New browser project</button><button class="button-primary" type="button" data-create-project="folder">＋ New project folder</button><button class="button-secondary" type="button" data-copy-project-to-folder ${currentProject?.storage === "folder" ? "disabled title=\"This project already saves to a folder\"" : ""}>Copy current project into repository root</button><button class="button-secondary" type="button" data-open-project-folder>Open project folder…</button></footer>
    </section>`;
    const close = () => backdrop.remove();
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop || event.target.closest("[data-close-manager]")) close();
      const switchButton = event.target.closest("[data-switch-project]");
      if (switchButton) {
        const id = switchButton.dataset.switchProject;
        void switchProject(id).then(close).catch(error => {
          console.error("Could not switch project.", error);
          close();
          notify(`Could not open project: ${error.message}`);
        });
      }
      const createButton = event.target.closest("[data-create-project]");
      if (createButton) {
        const makeFolder = createButton.dataset.createProject === "folder";
        close();
        void createProject(makeFolder);
      }
      if (event.target.closest("[data-import-project]")) { close(); chooseProjectImportFile(); }
      if (event.target.closest("[data-export-project]")) { close(); void exportProject(); }
      if (event.target.closest("[data-copy-project-to-folder]")) { close(); void copyProjectToFolder(); }
      if (event.target.closest("[data-open-project-folder]")) { close(); void openVault(); }
    });
    backdrop.addEventListener("change", event => {
      const input = event.target.closest("[data-project-module]");
      if (!input) return;
      const project = state.projects.find(item => item.id === input.dataset.projectId);
      if (!project) return;
      project.modules ||= {};
      project.modules[input.dataset.projectModule] = input.checked;
      if (!Object.values(project.modules).some(Boolean)) {
        input.checked = true;
        project.modules[input.dataset.projectModule] = true;
        notify("Keep at least one project module enabled.");
        return;
      }
      if (project.id === state.projectId) {
        let config = {};
        try { config = JSON.parse(state.files.get("config.json") || "{}"); }
        catch (error) {
          console.error("Could not parse the opened project's config.json.", error);
          notify("Project settings could not be read; default module settings are in use.");
        }
        config.modules = project.modules;
        state.files.set("config.json", JSON.stringify(config, null, 2));
        persistBrowserState();
        void writeVaultFileIfMounted("config.json", state.files.get("config.json"));
        if (!project.modules[state.currentModule]) showModule(project.modules.writing ? "writing" : MODULES.find(module => project.modules[module.id])?.id);
        renderAll();
      } else void persistProjectModules(project);
      persistProjectCatalog();
    });
    document.body.append(backdrop);
  }

  async function exportProject() {
    try {
      clearTimeout(state.saveTimer);
      await saveActiveFile();
      if (state.dirty) throw new Error("The current document could not be saved. Resolve the save issue before exporting.");
      const project = activeProject();
      if (!project) throw new Error("There is no active project to export.");
      const bundle = {
        format: "veritas-studio-project",
        version: 1,
        exportedAt: new Date().toISOString(),
        project: { name: project.name, modules: project.modules },
        snapshot: {
          dailyGoal: state.dailyGoal,
          dailyWords: state.dailyWords,
          dayStartWords: state.dayStartWords,
          sessionStart: state.sessionStart
        },
        files: [...state.files].map(([path, content]) => ({ path, content }))
      };
      if (!bundle.files.length) throw new Error("The active project has no files to export.");
      const filename = `${project.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").trim() || "Veritas Project"}.veritas.json`;
      downloadText(filename, JSON.stringify(bundle, null, 2), "application/json");
    } catch (error) {
      console.error("Could not export project.", error);
      notify(`Could not export project: ${error.message}`);
    }
  }

  function chooseProjectImportFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".veritas.json,application/json";
    input.addEventListener("cancel", () => input.remove(), { once: true });
    input.addEventListener("change", async () => {
      const [file] = input.files || [];
      input.remove();
      if (!file) return;
      try {
        const bundle = JSON.parse(await file.text());
        const { project, snapshot } = createImportedProject(bundle);
        const storageKey = `${PROJECT_DATA_PREFIX}${project.id}`;
        localStorage.setItem(storageKey, JSON.stringify(snapshot));
        state.projects.push(project);
        try {
          persistProjectCatalog();
        } catch (error) {
          state.projects.pop();
          localStorage.removeItem(storageKey);
          throw error;
        }
        await switchProject(project.id);
        notify(`Imported ${project.name}`);
      } catch (error) {
        console.error("Could not import project.", error);
        notify(`Could not import project: ${error.message}`);
      }
    }, { once: true });
    input.click();
  }

  function createImportedProject(bundle) {
    if (!bundle || bundle.format !== "veritas-studio-project" || bundle.version !== 1) {
      throw new Error("This is not a supported Veritas Studio project export.");
    }
    if (!bundle.project || typeof bundle.project.name !== "string" || !bundle.project.name.trim()) {
      throw new Error("The project export has no valid project name.");
    }
    if (!Array.isArray(bundle.files) || !bundle.files.length) {
      throw new Error("The project export contains no project files.");
    }
    const files = [];
    const paths = new Set();
    for (const file of bundle.files) {
      if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
        throw new Error("The project export contains an invalid file entry.");
      }
      const segments = file.path.split("/");
      if (!file.path || file.path.includes("\\") || file.path.includes("\0")
        || segments.some(segment => !segment || segment === "." || segment === ".."
          || /[<>:"|?*\u0000-\u001f]/.test(segment) || /[. ]$/.test(segment)
          || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))
        || !/\.(md|json)$/i.test(file.path)) {
        throw new Error(`The project export contains an unsafe or unsupported file path: ${file.path}`);
      }
      if (paths.has(file.path)) throw new Error(`The project export contains a duplicate file path: ${file.path}`);
      paths.add(file.path);
      files.push({ path: file.path, content: file.content });
    }
    const modules = Object.fromEntries(MODULES.map(module => [
      module.id,
      bundle.project.modules?.[module.id] === true
    ]));
    if (!Object.values(modules).some(Boolean)) modules.writing = true;
    const snapshot = bundle.snapshot && typeof bundle.snapshot === "object" ? bundle.snapshot : {};
    const project = {
      id: `project-${crypto.randomUUID()}`,
      name: bundle.project.name.trim(),
      storage: "browser",
      modules
    };
    return {
      project,
      snapshot: {
        name: project.name,
        files,
        dailyGoal: Number.isFinite(Number(snapshot.dailyGoal)) && Number(snapshot.dailyGoal) > 0 ? Number(snapshot.dailyGoal) : DEFAULT_GOAL,
        dailyWords: Number.isFinite(Number(snapshot.dailyWords)) && Number(snapshot.dailyWords) >= 0 ? Number(snapshot.dailyWords) : 0,
        dayStartWords: Number.isFinite(Number(snapshot.dayStartWords)) && Number(snapshot.dayStartWords) >= 0 ? Number(snapshot.dayStartWords) : 0,
        sessionStart: Number.isFinite(Number(snapshot.sessionStart)) && Number(snapshot.sessionStart) > 0 ? Number(snapshot.sessionStart) : Date.now()
      }
    };
  }

  async function copyProjectToFolder() {
    if (!desktop && !window.showDirectoryPicker) {
      notify("Folder access is unavailable here; run the app from localhost to save project files.");
      return;
    }
    const project = activeProject();
    if (!project || project.storage === "folder") return;
    try {
      const root = desktop
        ? await desktop.chooseDirectory("Select your Git repository root", "parent")
        : await window.showDirectoryPicker({ mode: "readwrite" });
      if (!root) return;
      const folderName = project.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").trim() || "Untitled Project";
      let target;
      if (desktop) {
        target = await desktop.createProjectFolder(root.path, folderName);
      } else {
        try {
          await root.getDirectoryHandle(folderName);
          throw new Error(`${folderName} already exists in the selected folder. Choose another repository root or open the existing project.`);
        } catch (error) {
          if (error.name !== "NotFoundError") throw error;
        }
        target = await root.getDirectoryHandle(folderName, { create: true });
      }
      if (state.activePath) {
        state.files.set(state.activePath, currentText());
        if (isEntityPath(state.activePath) && !state.files.has(companionPath(state.activePath))) {
          state.files.set(companionPath(state.activePath), JSON.stringify(entityData(state.activePath), null, 2));
        }
      }
      for (const [path, content] of state.files) await writeDirectoryFile(target, path, content);
      state.dirHandle = target;
      project.storage = "folder";
      await saveDirectoryHandle(target, project.id);
      persistProjectCatalog();
      persistBrowserState();
      updateProjectLabels();
      notify(`Project copied to ${folderName}/. Commit this folder to sync it with GitHub.`);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Could not copy the browser project into the app folder.", error);
        notify(`Could not copy project to folder: ${error.message}`);
      }
    }
  }

  async function persistProjectModules(project) {
    try {
      const key = `${PROJECT_DATA_PREFIX}${project.id}`;
      const snapshot = JSON.parse(localStorage.getItem(key) || "null") || { files: [] };
      snapshot.files ||= [];
      const configFile = snapshot.files.find(file => file.path === "config.json");
      let config = {};
      try { config = JSON.parse(configFile?.content || "{}"); }
      catch (error) { console.error(`Could not parse config for ${project.name}.`, error); }
      config.name = project.name;
      config.modules = project.modules;
      const content = JSON.stringify(config, null, 2);
      if (configFile) configFile.content = content;
      else snapshot.files.push({ path: "config.json", content });
      localStorage.setItem(key, JSON.stringify(snapshot));
      if (project.storage === "folder") {
        const handle = await getDirectoryHandle(project.id);
        if (!handle) { notify(`Folder unavailable; saved module selection for ${project.name} in the project catalog.`); return; }
        await writeDirectoryFile(handle, "config.json", content);
      }
    } catch (error) {
      console.error(`Could not save module selection for ${project.name}.`, error);
      notify(`Could not save module settings for ${project.name}: ${error.message}`);
    }
  }

  async function createProject(useFolder) {
    const name = await promptDialog("Create a project", "Project name");
    if (!name) return;
    const project = { id: `project-${crypto.randomUUID()}`, name, storage: "browser", modules: { ideation: false, writing: true, editing: false, publishing: false } };
    if (useFolder && (desktop || window.showDirectoryPicker)) {
      try {
        const safeName = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").trim() || "Untitled Project";
        const parent = desktop
          ? await desktop.chooseDirectory("Select where to create the project", "parent")
          : await window.showDirectoryPicker({ mode: "readwrite" });
        if (!parent) return;
        let folder;
        if (desktop) {
          folder = await desktop.createProjectFolder(parent.path, safeName);
          project.folderPath = folder.path;
        } else {
          folder = await parent.getDirectoryHandle(safeName, { create: true });
          for (const directory of ["Manuscript", "Worldbuilding/Characters", "Worldbuilding/Locations", "Worldbuilding/Factions", "Timelines", "Todos", "Ideation", "Editing", "Publishing"]) {
            let cursor = folder;
            for (const segment of directory.split("/")) cursor = await cursor.getDirectoryHandle(segment, { create: true });
          }
        }
        project.storage = "folder";
        await saveDirectoryHandle(folder, project.id);
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Could not create project folder.", error);
        notify(`Could not create folder project: ${error.message}`);
        return;
      }
    } else if (useFolder) {
      notify("Folder access is unavailable here; creating a browser-local project instead.");
    }
    state.projects.push(project);
    state.projectId = project.id;
    state.dirHandle = null;
    state.files = new Map([
      ["config.json", JSON.stringify({ name, dailyWordGoal: DEFAULT_GOAL, version: 1, modules: project.modules }, null, 2)],
      ["Ideation/ideas.json", JSON.stringify({ logline: "", premise: "", notes: "" }, null, 2)],
      ["Editing/revisions.json", JSON.stringify({ snapshots: [], checklist: [] }, null, 2)],
      ["Publishing/launch.json", JSON.stringify({ plan: "", checklist: [] }, null, 2)],
      ["Timelines/Plot planner.json", JSON.stringify({ threads: [{ id: "main", name: "Main plot", color: "accent" }], events: [], arcs: [] }, null, 2)],
      ["Todos/tasks.json", JSON.stringify({ items: [] }, null, 2)]
    ]);
    if (project.storage === "folder") {
      state.dirHandle = await getDirectoryHandle(project.id);
      if (!state.dirHandle) { project.storage = "browser"; state.dirHandle = null; }
      else {
        for (const [path, content] of state.files) await writeVaultFile(path, content);
      }
    }
    state.tabs = [];
    state.activePath = "";
    state.currentModule = "writing";
    state.currentView = "editor";
    state.plotThread = "all";
    state.dailyGoal = DEFAULT_GOAL;
    state.dailyWords = 0;
    state.dayStartWords = 0;
    state.sessionStart = Date.now();
    persistProjectCatalog();
    updateProjectLabels();
    persistBrowserState();
    renderAll();
    showEmptyEditor();
    notify(`Created ${name}`);
  }

  async function switchProject(projectId) {
    if (projectId === state.projectId) return;
    await saveActiveFile();
    const project = state.projects.find(item => item.id === projectId);
    if (!project) return;
    state.projectId = projectId;
    state.dirHandle = null;
    state.files.clear();
    state.tabs = [];
    state.activePath = "";
    state.currentModule = project.modules?.writing ? "writing" : MODULES.find(module => project.modules?.[module.id])?.id || "writing";
    state.currentView = "editor";
    state.plotThread = "all";
    if (project.storage === "folder") {
      const handle = await getDirectoryHandle(project.id);
      if (handle) {
        if (desktop) {
          state.dirHandle = handle;
          await readDirectory(handle);
        } else {
          let permission = await handle.queryPermission({ mode: "readwrite" });
          if (permission !== "granted") permission = await handle.requestPermission({ mode: "readwrite" });
          if (permission !== "granted") {
            notify("Folder permission was not granted. This project remains available in its browser cache.");
            project.storage = "browser";
          } else {
            state.dirHandle = handle;
            await readDirectory(handle);
          }
        }
      } else project.storage = "browser";
    }
    if (!state.dirHandle) {
      const saved = JSON.parse(localStorage.getItem(`${PROJECT_DATA_PREFIX}${project.id}`) || "null");
      state.files = new Map((saved?.files || []).map(file => [file.path, file.content]));
    }
    if (!state.files.has("config.json")) state.files.set("config.json", JSON.stringify({ name: project.name, dailyWordGoal: DEFAULT_GOAL, version: 1, modules: project.modules }, null, 2));
    const snapshot = JSON.parse(localStorage.getItem(`${PROJECT_DATA_PREFIX}${project.id}`) || "null") || {};
    let projectConfig = {};
    try { projectConfig = JSON.parse(state.files.get("config.json") || "{}"); }
    catch (error) { console.error("Could not parse project config.json.", error); notify("Project settings could not be loaded; using stored settings."); }
    if (projectConfig.modules) project.modules = { ideation: false, writing: true, editing: false, publishing: false, ...project.modules, ...projectConfig.modules };
    if (!project.modules?.[state.currentModule]) state.currentModule = MODULES.find(module => project.modules?.[module.id])?.id || "writing";
    state.dailyGoal = Number(snapshot.dailyGoal) || Number(projectConfig.dailyWordGoal) || DEFAULT_GOAL;
    state.dailyWords = Number(snapshot.dailyWords) || 0;
    state.dayStartWords = Number(snapshot.dayStartWords) || 0;
    state.sessionStart = Number(snapshot.sessionStart) || Date.now();
    if (new Date(state.sessionStart).toDateString() !== new Date().toDateString()) {
      state.sessionStart = Date.now();
      state.dayStartWords = 0;
      state.dailyWords = 0;
    }
    restoreMetrics();
    updateProjectLabels();
    persistProjectCatalog();
    renderAll();
    const first = [...state.files.keys()].find(path => path.startsWith("Manuscript/")) || [...state.files.keys()].find(path => path !== "config.json");
    if (first) openFile(first);
    else if (project.modules?.writing) showEmptyEditor();
    else showModule(state.currentModule);
  }

  async function getDirectoryHandle(projectId) {
    if (desktop) {
      const project = state.projects.find(item => item.id === projectId);
      return project?.folderPath ? { path: project.folderPath, name: project.name } : null;
    }
    if (!("indexedDB" in window)) return null;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const handle = await new Promise((resolve, reject) => {
      const request = db.transaction(DB_STORE).objectStore(DB_STORE).get(projectId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  }

  function renderBinder() {
    const sets = {
      chapter: $("#chapter-list"),
      character: $("#character-list"),
      location: $("#location-list"),
      faction: $("#faction-list"),
      timeline: $("#timeline-list")
    };
    Object.values(sets).forEach(node => node.replaceChildren());
    const paths = [...state.files.keys()].filter(path => path.endsWith(".md")).sort((a, b) => a.localeCompare(b));
    paths.forEach(path => {
      const type = category(path);
      const bucket = type === "lore" ? worldbuildingType(path) : type;
      if (!sets[bucket]) return;
      const item = document.createElement("div");
      item.className = `tree-item${path === state.activePath ? " active" : ""}`;
      item.dataset.path = path;
      const icon = type === "chapter" ? "▤" : type === "timeline" ? "⌁" : "◇";
      const meta = type === "chapter" ? `${words(state.files.get(path))}` : "";
      item.innerHTML = `<span class="tree-icon">${icon}</span><span class="tree-label">${escapeHtml(basename(path))}</span>${meta ? `<span class="tree-meta">${meta}</span>` : ""}${type === "chapter" ? '<button class="tree-export" type="button" title="Export this chapter" aria-label="Export this chapter">⇩</button>' : ""}`;
      item.addEventListener("click", event => {
        if (event.target.closest(".tree-export")) {
          event.stopPropagation();
          openExportDialog({ path, scope: "chapter" });
          return;
        }
        openFile(path);
      });
      sets[bucket].append(item);
    });
    Object.entries(sets).forEach(([type, container]) => {
      if (!container.children.length) container.innerHTML = `<div class="empty-hint">No ${type === "chapter" ? "chapters" : `${type}s`} yet.</div>`;
    });
  }

  function renderEntityFields(path, data = entityData(path)) {
    const type = worldbuildingType(path);
    const fields = getSchemas()[type] || DEFAULT_SCHEMAS.character;
    const container = $("#entity-fields");
    container.replaceChildren();
    fields.forEach(field => {
      const label = document.createElement("label");
      label.className = "entity-field";
      label.innerHTML = `<span>${escapeHtml(field.name)}</span>`;
      let input;
      if (field.type === "dropdown") {
        input = document.createElement("select");
        (field.options || []).forEach(option => {
          const choice = document.createElement("option");
          choice.value = option;
          choice.textContent = option;
          input.append(choice);
        });
      } else {
        input = document.createElement(field.type === "long-text" ? "textarea" : "input");
        input.type = field.type === "number" ? "number" : "text";
      }
      input.dataset.entityField = field.name;
      input.value = data[field.name] ?? "";
      input.setAttribute("aria-label", field.name);
      input.addEventListener("input", () => updateEntityField(path, field.name, input.value, field.type));
      input.addEventListener("change", () => updateEntityField(path, field.name, input.value, field.type));
      label.append(input);
      container.append(label);
    });
    container.hidden = false;
  }

  function updateEntityField(path, name, value, type) {
    const data = entityData(path);
    if (type === "number" && value !== "") {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return;
      data[name] = numericValue;
    } else {
      data[name] = value;
    }
    state.files.set(companionPath(path), JSON.stringify(data, null, 2));
    if (name === "Name" && state.activePath === path) {
      $("#document-title").value = value;
      updateSorth();
    }
    markDirty();
  }

  function openFile(path) {
    if (!path || !state.files.has(path)) return;
    if (activeProject()?.modules?.writing) {
      state.currentModule = "writing";
      state.currentView = "editor";
      $("#lifecycle-view").hidden = true;
      $("[data-panel=editor]").hidden = false;
      renderModuleNavigation();
      applyModuleVisibility();
    }
    if (state.dirty) {
      clearTimeout(state.saveTimer);
      void saveActiveFile();
      state.dirty = false;
    }
    if (!state.tabs.includes(path)) state.tabs.push(path);
    state.activePath = path;
    const isEntity = isEntityPath(path);
    const isJson = path.toLowerCase().endsWith(".json");
    const data = isEntity ? entityData(path) : null;
    $("#document-title").value = data?.Name || basename(path);
    $("#document-title").disabled = isJson;
    $("#document-title").hidden = isEntity || isJson;
    $("#entity-fields").hidden = !isEntity;
    if (isEntity) {
      renderEntityFields(path, data);
      if (!state.files.has(companionPath(path))) {
        state.files.set(companionPath(path), JSON.stringify(data, null, 2));
        void writeVaultFileIfMounted(companionPath(path), state.files.get(companionPath(path)));
        persistBrowserState();
      }
    }
    $("#document-content").value = state.files.get(path);
    $("#rich-document-content").hidden = isJson;
    $("#document-content").hidden = !isJson;
    if (!isJson) renderMarkdownEditor($("#document-content").value);
    state.lastWordCount = words(editorBodyText());
    $("#document-type").textContent = category(path).toUpperCase() + (category(path) === "chapter" ? ` ${String([...state.files.keys()].filter(item => category(item) === "chapter").indexOf(path) + 1).padStart(2, "0")}` : "");
    $("#breadcrumb").innerHTML = `${escapeHtml(path.split("/").slice(0, -1).join(" / ") || "Vault")} <span>›</span> ${escapeHtml(basename(path))}`;
    $("#document-date").textContent = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date());
    if (state.splitPath && !state.tabs.includes(state.splitPath)) state.tabs.push(state.splitPath);
    renderTabs();
    renderBinder();
    updateStats();
    updateSorth();
  }

  function renderTabs() {
    const container = $("#tabs");
    container.replaceChildren();
    state.tabs.forEach(path => {
      const tab = document.createElement("div");
      tab.className = `tab${path === state.activePath ? " active" : ""}`;
      tab.innerHTML = `<span class="tab-label">${escapeHtml(basename(path))}</span><button class="tab-close" aria-label="Close ${escapeHtml(basename(path))}">×</button>`;
      tab.addEventListener("click", event => {
        if (event.target.closest(".tab-close")) {
          event.stopPropagation();
          closeTab(path);
        } else openFile(path);
      });
      container.append(tab);
    });
    renderSplitTabs();
  }

  function renderSplitTabs() {
    const tabs = $("#split-tabs");
    tabs.replaceChildren();
    if (!state.splitPath) return;
    const tab = document.createElement("div");
    tab.className = "tab active";
    tab.innerHTML = `<span class="tab-label">${escapeHtml(basename(state.splitPath))}</span>`;
    tabs.append(tab);
  }

  function closeTab(path) {
    if (state.dirty) {
      clearTimeout(state.saveTimer);
      void saveActiveFile();
      state.dirty = false;
    }
    state.tabs = state.tabs.filter(tab => tab !== path);
    if (state.splitPath === path) state.splitPath = "";
    if (state.activePath === path) {
      state.activePath = state.tabs.at(-1) || "";
      if (state.activePath) openFile(state.activePath);
      else {
        $("#document-title").value = "";
        $("#document-content").value = "";
        $("#document-content").hidden = true;
        $("#rich-document-content").hidden = false;
        $("#rich-document-content").innerHTML = "";
        updateStats();
      }
    }
    renderTabs();
    renderBinder();
  }

  function currentText() {
    const title = $("#document-title").value.trim();
    const content = editorBodyText();
    if (state.activePath.toLowerCase().endsWith(".json")) return content;
    return title ? `# ${title}\n\n${content.replace(/^#\s+[^\n]+\n*/, "").trimStart()}` : content;
  }

  function editorBodyText() {
    return $("#document-content").hidden ? richEditorMarkdown() : $("#document-content").value;
  }

  function inlineMarkdownHtml(value) {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi, '<a href="$2">$1</a>');
  }

  function renderMarkdownEditor(markdown) {
    const editor = $("#rich-document-content");
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    if (/^#\s+/.test(lines[0] || "")) {
      lines.shift();
      if (lines[0] === "") lines.shift();
    }
    const blocks = [];
    let index = 0;
    const isBlockStart = line => /^(#{1,3}\s|>\s?|[-*]\s+|\d+[.)]\s+|---+\s*$)/.test(line);
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index++; continue; }
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        blocks.push(`<h${heading[1].length}>${inlineMarkdownHtml(heading[2])}</h${heading[1].length}>`);
        index++;
        continue;
      }
      if (/^---+\s*$/.test(line)) { blocks.push("<hr>"); index++; continue; }
      if (/^>\s?/.test(line)) {
        const quote = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
        blocks.push(`<blockquote><p>${quote.map(inlineMarkdownHtml).join("<br>")}</p></blockquote>`);
        continue;
      }
      if (/^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
        const ordered = /^\d+[.)]\s+/.test(line);
        const tag = ordered ? "ol" : "ul";
        const items = [];
        while (index < lines.length && (ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/).test(lines[index])) {
          items.push(`<li>${inlineMarkdownHtml(lines[index++].replace(ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/, ""))}</li>`);
        }
        blocks.push(`<${tag}>${items.join("")}</${tag}>`);
        continue;
      }
      const paragraph = [];
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) paragraph.push(lines[index++]);
      if (!paragraph.length) paragraph.push(lines[index++]);
      blocks.push(`<p>${paragraph.map(inlineMarkdownHtml).join("<br>")}</p>`);
    }
    editor.innerHTML = blocks.join("");
    state.editorSelection = null;
  }

  function editorInlineMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node;
    const content = [...element.childNodes].map(editorInlineMarkdown).join("");
    switch (element.tagName) {
      case "BR": return "\n";
      case "B":
      case "STRONG": return `**${content}**`;
      case "I":
      case "EM": return `*${content}*`;
      case "CODE": return `\`${content}\``;
      case "A": {
        const href = element.getAttribute("href") || "";
        return /^https?:\/\//i.test(href) || /^mailto:/i.test(href) ? `[${content}](${href})` : content;
      }
      default: return content;
    }
  }

  function editorBlockMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue?.trim() || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node;
    if (element.tagName === "UL" || element.tagName === "OL") {
      const ordered = element.tagName === "OL";
      return [...element.children].filter(item => item.tagName === "LI").map((item, index) => {
        const marker = ordered ? `${index + 1}.` : "-";
        let text = "";
        const nested = [];
        [...item.childNodes].forEach(child => {
          if (child.nodeType === Node.ELEMENT_NODE && ["UL", "OL"].includes(child.tagName)) nested.push(editorBlockMarkdown(child));
          else text += editorInlineMarkdown(child);
        });
        return [`${marker} ${text.trim()}`, ...nested.flatMap(list => list.split("\n").map(line => `  ${line}`))].join("\n");
      }).join("\n");
    }
    if (element.tagName === "BLOCKQUOTE") {
      const quote = [...element.childNodes].map(editorBlockMarkdown).filter(Boolean).join("\n");
      return quote.split("\n").map(line => `> ${line}`).join("\n");
    }
    if (/^H[1-3]$/.test(element.tagName) && element.querySelector("ul,ol")) return [...element.childNodes].map(editorBlockMarkdown).filter(Boolean).join("\n");
    if (/^H[1-3]$/.test(element.tagName)) {
      return `${"#".repeat(Number(element.tagName[1]))} ${[...element.childNodes].map(editorInlineMarkdown).join("").trim()}`;
    }
    if (element.tagName === "HR") return "---";
    if (element.tagName === "P" || element.tagName === "DIV") {
      if (element.querySelector("ul,ol")) return [...element.childNodes].map(editorBlockMarkdown).filter(Boolean).join("\n");
      return [...element.childNodes].map(editorInlineMarkdown).join("").trim();
    }
    return [...element.childNodes].map(editorBlockMarkdown).filter(Boolean).join("\n");
  }

  function richEditorMarkdown() {
    return [...$("#rich-document-content").childNodes].map(editorBlockMarkdown).filter(Boolean).join("\n\n");
  }

  function restoreEditorSelection() {
    const editor = $("#rich-document-content");
    editor.focus();
    if (!state.editorSelection || !editor.contains(state.editorSelection.commonAncestorContainer)) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(state.editorSelection);
  }

  function syncRichEditor() {
    $("#document-content").value = richEditorMarkdown();
  }

  function markDirty() {
    state.dirty = true;
    $("#save-indicator").classList.add("saving");
    $("#save-indicator").title = "Unsaved changes";
    $("#editor-save-state").textContent = "Saving…";
    setStatus("Saving changes…");
    const currentWords = words(editorBodyText());
    state.dailyWords = Math.max(0, state.dailyWords + currentWords - state.lastWordCount);
    state.lastWordCount = currentWords;
    persistMetrics();
    updateStats();
    updateSorth();
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => saveActiveFile(), 450);
  }

  async function saveActiveFile() {
    if (!state.activePath) return;
    const path = state.activePath;
    const content = currentText();
    state.files.set(path, content);
    try {
      if (state.dirHandle) {
        await writeVaultFile(path, content);
        if (isEntityPath(path)) await writeVaultFile(companionPath(path), state.files.get(companionPath(path)) || JSON.stringify(entityData(path), null, 2));
      } else if (isEntityPath(path) && !state.files.has(companionPath(path))) {
        state.files.set(companionPath(path), JSON.stringify(entityData(path), null, 2));
      }
      persistBrowserState();
      if (state.activePath === path) {
        state.dirty = false;
        $("#save-indicator").classList.remove("saving");
        $("#save-indicator").title = "All changes saved";
        $("#editor-save-state").textContent = "Saved";
        setStatus("All changes saved");
        $("#last-edited").textContent = "Just now";
      }
      renderBinder();
    } catch (error) {
      console.error("Could not save the current document.", error);
      $("#editor-save-state").textContent = "Save failed";
      setStatus("Save failed");
      notify(`Could not save file: ${error.message}`);
    }
  }

  async function writeVaultFile(path, content) {
    return writeDirectoryFile(state.dirHandle, path, content);
  }

  async function writeDirectoryFile(rootHandle, path, content) {
    if (desktop) return desktop.writeProjectFile(rootHandle.path, path, content);
    const parts = path.split("/");
    const filename = parts.pop();
    let directory = rootHandle;
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true });
    const file = await directory.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(content);
    await writable.close();
  }

  function updateStats() {
    const text = editorBodyText();
    const count = words(text);
    const minutes = Math.max(1, Math.ceil(count / 220));
    $("#word-count").textContent = `${count.toLocaleString()} words`;
    $("#reading-time").textContent = `${minutes} min read`;
    $("#detail-words").textContent = count.toLocaleString();
    $("#detail-characters").textContent = text.length.toLocaleString();
    $("#detail-reading").textContent = `${minutes} min`;
    const today = state.dailyWords;
    const pct = Math.min(100, Math.round(today / state.dailyGoal * 100));
    $("#goal-progress").innerHTML = `${today.toLocaleString()} <span>/ ${state.dailyGoal.toLocaleString()}</span>`;
    $("#goal-percent").textContent = `${pct}%`;
    $("#goal-bar").style.width = `${pct}%`;
    $(".progress-ring").style.setProperty("--progress", `${pct}%`);
    $("#session-count").textContent = `Today ${today.toLocaleString()} words`;
  }

  function updateSorth() {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(() => {
      const text = `${$("#document-title").value}\n${editorBodyText()}`.toLocaleLowerCase();
      const matches = [...state.files.keys()]
        .filter(path => isEntityPath(path))
        .map(path => ({ path, name: basename(path) }))
        .filter(entry => entry.name.length > 1 && text.includes(entry.name.toLocaleLowerCase()));
      const results = $("#sorth-results");
      results.replaceChildren();
      if (!matches.length) {
        results.innerHTML = '<div class="empty-hint">No linked entries found in this document.</div>';
        return;
      }
      matches.slice(0, 6).forEach(entry => {
        const button = document.createElement("button");
        button.className = "sorth-item";
        button.innerHTML = `<span class="sorth-mark">◇</span><strong>${escapeHtml(entry.name)}</strong><small>${category(entry.path) === "lore" ? entry.path.split("/")[1] : ""}</small>`;
        button.addEventListener("click", () => openFile(entry.path));
        results.append(button);
      });
    }, 130);
  }

  function renderRelatedLore() {
    const container = $("#related-lore");
    container.replaceChildren();
    [...state.files.keys()].filter(path => isEntityPath(path)).slice(0, 5).forEach(path => {
      const chip = document.createElement("button");
      chip.className = "lore-chip";
      chip.textContent = basename(path);
      chip.addEventListener("click", () => openFile(path));
      container.append(chip);
    });
    if (!container.children.length) container.innerHTML = '<div class="empty-hint">Create a character, location, or faction entry.</div>';
  }

  function readTimelineEvents() {
    const path = [...state.files.keys()].find(item => category(item) === "timeline");
    if (!path) return [];
    return state.files.get(path).split(/\r?\n/)
      .map(line => line.match(/^\s*-\s*(.*?)\s*\|\s*(.+)$/))
      .filter(Boolean)
      .map(match => ({ date: match[1], title: match[2] }));
  }

  function renderTimeline() {
    const container = $("#timeline-events");
    container.replaceChildren();
    readTimelineEvents().slice(0, 4).forEach(event => {
      const row = document.createElement("div");
      row.className = "timeline-event";
      row.innerHTML = `<small>${escapeHtml(event.date)}</small><strong>${escapeHtml(event.title)}</strong>`;
      container.append(row);
    });
    if (!container.children.length) container.innerHTML = '<div class="empty-hint">Add events to begin your timeline.</div>';
  }

  function newFile(type) {
    const definitions = {
      chapter: { folder: "Manuscript", label: "New Chapter", body: "# New Chapter\n\n" },
      character: { folder: "Worldbuilding/Characters", label: "New Character", body: "# New Character\n\n" },
      location: { folder: "Worldbuilding/Locations", label: "New Location", body: "# New Location\n\n" },
      faction: { folder: "Worldbuilding/Factions", label: "New Faction", body: "# New Faction\n\n" },
      timeline: { folder: "Timelines", label: "New Timeline", body: "# New Timeline\n\n- 0 | First event\n" }
    };
    const entry = definitions[type];
    if (!entry) return;
    let number = [...state.files.keys()].filter(path => path.startsWith(`${entry.folder}/`) && path.endsWith(".md")).length + 1;
    let path = `${entry.folder}/${String(number).padStart(2, "0")} - ${entry.label}.md`;
    while (state.files.has(path)) {
      number++;
      path = `${entry.folder}/${String(number).padStart(2, "0")} - ${entry.label}.md`;
    }
    state.files.set(path, entry.body);
    if (["character", "location", "faction"].includes(type)) {
      const data = Object.fromEntries((getSchemas()[type] || []).map(field => [field.name, field.name === "Name" ? entry.label : ""]));
      state.files.set(companionPath(path), JSON.stringify(data, null, 2));
    }
    renderAll();
    openFile(path);
    void saveActiveFile();
    notify(`${entry.label} created`);
  }

  async function writeVaultFileIfMounted(path, content) {
    if (!state.dirHandle) return;
    try { await writeVaultFile(path, content); }
    catch (error) { console.error("Could not create vault file.", error); notify(`Could not create file: ${error.message}`); }
  }

  async function addTimelineEvent() {
    const path = [...state.files.keys()].find(item => category(item) === "timeline");
    if (!path) { newFile("timeline"); return; }
    const title = await promptDialog("Add timeline event", "Event name");
    if (!title) return;
    const date = await promptDialog("Place this event", "Timeline marker (e.g. 3 or 1200 AF)");
    if (date === null) return;
    state.files.set(path, `${state.files.get(path).trimEnd()}\n- ${date || "0"} | ${title}\n`);
    await writeVaultFileIfMounted(path, state.files.get(path));
    renderTimeline();
    notify("Timeline event added");
  }

  function promptDialog(title, placeholder, initial = "") {
    return new Promise(resolve => {
      const backdrop = document.createElement("div");
      backdrop.className = "dialog-backdrop";
      backdrop.innerHTML = `<form class="dialog-card"><h3>${escapeHtml(title)}</h3><input autofocus placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(initial)}"><div class="dialog-actions"><button type="button" data-cancel>Cancel</button><button class="primary" type="submit">Save</button></div></form>`;
      const input = $("input", backdrop);
      const finish = value => { backdrop.remove(); resolve(value); };
      $("form", backdrop).addEventListener("submit", event => { event.preventDefault(); finish(input.value.trim()); });
      $("[data-cancel]", backdrop).addEventListener("click", () => finish(null));
      backdrop.addEventListener("click", event => { if (event.target === backdrop) finish(null); });
      document.body.append(backdrop);
      input.focus();
      input.select();
    });
  }

  async function openVault() {
    if (!desktop && !window.showDirectoryPicker) {
      $("#folder-fallback").click();
      return;
    }
    try {
      await saveActiveFile();
      const handle = desktop
        ? await desktop.chooseDirectory("Open an existing project folder", "project")
        : await window.showDirectoryPicker({ mode: "readwrite" });
      if (!handle) return;
      state.dirHandle = handle;
      state.importedFolder = false;
      state.files.clear();
      state.tabs = [];
      state.activePath = "";
      const existing = state.projects.find(project => project.storage === "folder" && (desktop ? project.folderPath === handle.path : project.name === handle.name));
      const project = existing || { id: `project-${crypto.randomUUID()}`, name: handle.name, storage: "folder", modules: { ideation: false, writing: true, editing: false, publishing: false } };
      if (desktop) project.folderPath = handle.path;
      if (!existing) state.projects.push(project);
      state.projectId = project.id;
      await saveDirectoryHandle(handle, project.id);
      await saveDirectoryHandle(handle);
      await readDirectory(handle);
      const config = JSON.parse(state.files.get("config.json") || "{}");
      project.modules = { ...project.modules, ...(config.modules || {}) };
      state.currentModule = project.modules.writing ? "writing" : MODULES.find(module => project.modules[module.id])?.id || "writing";
      updateProjectLabels();
      localStorage.removeItem(STORAGE_KEY);
      persistProjectCatalog();
      persistBrowserState();
      renderAll();
      const firstChapter = [...state.files.keys()].find(path => category(path) === "chapter");
      const firstContent = [...state.files.keys()].find(path => path !== "config.json");
      if (firstChapter) openFile(firstChapter);
      else if (firstContent) openFile(firstContent);
      else if (project.modules.writing) {
        newFile("chapter");
        await saveActiveFile();
      } else showModule(state.currentModule);
      notify(`Opened ${handle.name}`);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Could not open the selected vault.", error);
        notify(`Could not open vault: ${error.message}`);
      }
    }
  }

  async function readDirectory(handle, prefix = "") {
    if (desktop) {
      if (prefix) return;
      for (const file of await desktop.readProject(handle.path)) state.files.set(file.path, file.content);
      return;
    }
    for await (const [name, entry] of handle.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === "directory") await readDirectory(entry, path);
      else if (/\.(md|json)$/i.test(name)) {
        const file = await entry.getFile();
        state.files.set(path, await file.text());
      }
    }
  }

  async function saveDirectoryHandle(handle, key = "last-vault") {
    if (desktop) {
      const project = state.projects.find(item => item.id === key);
      if (project) {
        project.folderPath = handle.path;
        project.storage = "folder";
      }
      return;
    }
    if (!("indexedDB" in window)) return;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(handle, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function restoreDirectoryHandle() {
    if (desktop) {
      const project = activeProject();
      if (!project || project.storage !== "folder" || !project.folderPath) return false;
      state.dirHandle = { path: project.folderPath, name: project.name };
      state.files.clear();
      await readDirectory(state.dirHandle);
      try {
        const config = JSON.parse(state.files.get("config.json") || "{}");
        if (config.modules) project.modules = { ...project.modules, ...config.modules };
      } catch (error) {
        console.error("Could not parse the restored project's config.json.", error);
        notify("Project module preferences could not be read.");
      }
      if (!project.modules?.[state.currentModule]) state.currentModule = MODULES.find(module => project.modules?.[module.id])?.id || "writing";
      updateProjectLabels();
      persistProjectCatalog();
      return true;
    }
    if (!("indexedDB" in window)) return false;
    try {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const handle = await new Promise((resolve, reject) => {
        const store = db.transaction(DB_STORE).objectStore(DB_STORE);
        const request = store.get(state.projectId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      const restoredHandle = handle || (state.projects.length === 1 ? await getDirectoryHandle("last-vault") : null);
      if (!restoredHandle) return false;
      let permission = await restoredHandle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") permission = await restoredHandle.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") return false;
      state.dirHandle = restoredHandle;
      state.files.clear();
      await readDirectory(restoredHandle);
      const project = activeProject();
      if (project) { project.name = restoredHandle.name; project.storage = "folder"; }
      try {
        const config = JSON.parse(state.files.get("config.json") || "{}");
        if (project && config.modules) project.modules = { ...project.modules, ...config.modules };
      } catch (error) {
        console.error("Could not parse the restored project's config.json.", error);
        notify("Project module preferences could not be read.");
      }
      if (project && !project.modules?.[state.currentModule]) state.currentModule = MODULES.find(module => project.modules?.[module.id])?.id || "writing";
      await saveDirectoryHandle(restoredHandle, state.projectId);
      updateProjectLabels();
      persistProjectCatalog();
      return true;
    } catch (error) {
      console.warn("Could not restore the previous local folder.", error);
      return false;
    }
  }

  function readFallbackFiles(files) {
    state.files.clear();
    const pending = [...files].filter(file => /\.(md|json)$/i.test(file.name));
    let complete = 0;
    if (!pending.length) { notify("No .md or .json files were found in that folder."); return; }
    pending.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const relative = file.webkitRelativePath || file.name;
        state.files.set(relative.split("/").slice(1).join("/") || file.name, String(reader.result));
        complete++;
        if (complete === pending.length) {
          const folderName = pending[0].webkitRelativePath?.split("/")[0] || "Local Vault";
          $("#project-name").textContent = folderName;
          $("#binder-vault-name").textContent = folderName;
          $("#vault-mode").textContent = "Imported browser vault";
          state.dirHandle = null;
          state.importedFolder = true;
          renderAll();
          const first = [...state.files.keys()].find(path => category(path) === "chapter");
          if (first) openFile(first);
          notify("Imported to browser storage; the original folder is unchanged.");
        }
      };
      reader.onerror = () => {
        console.error("Could not read selected file.", reader.error);
        notify(`Could not read ${file.name}`);
      };
      reader.readAsText(file);
    });
  }

  function runEditorCommand(command, value = "") {
    restoreEditorSelection();
    if (["insertUnorderedList", "insertOrderedList"].includes(command)) {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement;
      if (anchor?.closest("h1,h2,h3")) document.execCommand("formatBlock", false, "<p>");
    }
    document.execCommand(command, false, value);
    syncRichEditor();
    markDirty();
  }

  function openFindReplace() {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    backdrop.innerHTML = '<form class="dialog-card find-replace-dialog" role="dialog" aria-modal="true" aria-labelledby="find-replace-title"><h3 id="find-replace-title">Find and replace</h3><label>Find<input name="find" type="search" autocomplete="off" required></label><label>Replace with<input name="replace" autocomplete="off"></label><div class="find-replace-status" aria-live="polite"></div><div class="dialog-actions"><button type="button" data-close-find>Close</button><button class="primary" type="submit">Replace all</button></div></form>';
    const form = $("form", backdrop);
    const findInput = $('input[name="find"]', form);
    const replaceInput = $('input[name="replace"]', form);
    const status = $(".find-replace-status", form);
    form.addEventListener("submit", event => {
      event.preventDefault();
      const query = findInput.value;
      if (!query) return;
      const matcher = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const walker = document.createTreeWalker($("#rich-document-content"), NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      let replaced = 0;
      textNodes.forEach(node => {
        const original = node.nodeValue || "";
        const matches = original.match(matcher);
        if (!matches) return;
        replaced += matches.length;
        node.nodeValue = original.replace(matcher, () => replaceInput.value);
      });
      if (replaced) {
        syncRichEditor();
        markDirty();
      }
      status.textContent = replaced ? `${replaced} replacement${replaced === 1 ? "" : "s"} made.` : "No matches found.";
      findInput.focus();
      findInput.select();
    });
    $("[data-close-find]", form).addEventListener("click", () => backdrop.remove());
    backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
    document.body.append(backdrop);
    findInput.focus();
  }

  function setupSplit(direction) {
    if (!state.splitPath) {
      state.splitPath = state.tabs.find(path => path !== state.activePath) || state.activePath;
      if (state.splitPath === state.activePath) {
        const other = [...state.files.keys()].find(path => path !== state.activePath);
        if (other) state.splitPath = other;
      }
      if (!state.splitPath || state.splitPath === state.activePath) {
        notify("Open another document to create a split view.");
        state.splitPath = "";
        return;
      }
    }
    state.splitDirection = direction;
    $("#editor-layout").classList.toggle("vertical", direction === "vertical");
    $("#split-surface").hidden = false;
    $("#split-content").value = state.files.get(state.splitPath) || "";
    renderSplitTabs();
  }

  function setupSearch() {
    const modal = document.createElement("div");
    modal.className = "search-modal";
    modal.innerHTML = '<div class="search-box"><input class="search-input" placeholder="Search your vault…" aria-label="Search your vault"><div class="search-results"></div></div>';
    const input = $(".search-input", modal);
    const results = $(".search-results", modal);
    const render = () => {
      const query = input.value.trim().toLowerCase();
      results.replaceChildren();
      [...state.files].filter(([path, content]) => !query || `${path}\n${content}`.toLowerCase().includes(query)).slice(0, 30).forEach(([path, content]) => {
        const row = document.createElement("button");
        row.className = "search-result";
        const snippet = query ? content.toLowerCase().indexOf(query) : -1;
        row.innerHTML = `<span>◇</span><strong>${escapeHtml(basename(path))}</strong><small>${escapeHtml(path)}</small>${snippet >= 0 ? `<small>${escapeHtml(content.slice(Math.max(0, snippet - 20), snippet + 60).replace(/\n/g, " "))}</small>` : ""}`;
        row.addEventListener("click", () => { modal.remove(); openFile(path); });
        results.append(row);
      });
      if (!results.children.length) results.innerHTML = '<div class="empty-hint">No matching files.</div>';
    };
    input.addEventListener("input", render);
    modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); });
    document.addEventListener("keydown", function closeOnEscape(event) {
      if (event.key === "Escape" && modal.isConnected) { modal.remove(); document.removeEventListener("keydown", closeOnEscape); }
    });
    document.body.append(modal);
    render();
    input.focus();
  }

  function openExportDialog({ path = state.activePath, scope = "current" } = {}) {
    $(".menu-popover")?.remove();
    $(".dialog-backdrop.export-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop export-backdrop";
    const isChapter = path && path.startsWith("Manuscript/");
    const initialScope = scope === "current" && isChapter ? "current" : scope;
    const chapterOptions = [...state.files.keys()]
      .filter(item => item.startsWith("Manuscript/") && item.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b))
      .map(item => `<option value="${escapeHtml(item)}"${item === path ? " selected" : ""}>${escapeHtml(basename(item))}</option>`).join("");
    backdrop.innerHTML = `<section class="dialog-card export-card" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div class="modal-heading"><div><span class="eyebrow">TAKE YOUR WORK WITH YOU</span><h3 id="export-title">Export</h3></div><button class="icon-button small" data-close-export aria-label="Close export settings">×</button></div>
      <div class="export-workspace"><aside class="export-nav"><span class="eyebrow">EXPORT TASK</span><div class="export-nav-item active"><span>01</span> Content</div><div class="export-nav-item"><span>02</span> File format</div><div class="export-nav-item"><span>03</span> Page setup</div><div class="export-summary"><span class="eyebrow">READY TO CREATE</span><strong id="export-summary-title">Current document</strong><small id="export-summary-detail">Word document · .docx</small></div></aside><div class="export-content">
      <p class="modal-intro">Choose what to export and how it should be prepared.</p>
      <div class="export-label">SCOPE</div>
      <div class="export-scope">
        <label class="scope-option"><input type="radio" name="export-scope" value="current"${initialScope === "current" ? " checked" : ""}><span><strong>Current document</strong><small>Export the open note or chapter</small></span></label>
        <label class="scope-option"><input type="radio" name="export-scope" value="chapter"${initialScope === "chapter" ? " checked" : ""}><span><strong>Choose a chapter</strong><small>Export one manuscript chapter</small></span></label>
        <label class="scope-option"><input type="radio" name="export-scope" value="manuscript"${initialScope === "manuscript" ? " checked" : ""}><span><strong>Full manuscript</strong><small>Combine every chapter in binder order</small></span></label>
      </div>
      <label class="export-chapter-select" id="export-chapter-wrap"${initialScope === "chapter" ? "" : " hidden"}><span>CHAPTER</span><select id="export-chapter">${chapterOptions}</select></label>
      <div class="export-label">FORMAT</div>
      <div class="format-options">
        <label class="format-option"><input type="radio" name="export-format" value="docx" checked><span class="format-icon">W</span><span><strong>Word document</strong><small>.docx · editable</small></span></label>
        <label class="format-option"><input type="radio" name="export-format" value="pdf"><span class="format-icon">P</span><span><strong>Print-ready PDF</strong><small>Opens print dialog</small></span></label>
        <label class="format-option"><input type="radio" name="export-format" value="md"><span class="format-icon">M</span><span><strong>Markdown</strong><small>.md · plain text</small></span></label>
      </div>
      <div class="export-options">
        <label><input type="checkbox" id="export-title-page"><span>Include title page</span></label>
        <label><input type="checkbox" id="export-chapter-breaks" checked><span>Start chapters on a new page</span></label>
      </div>
      </div></div>
      <div class="dialog-actions"><button type="button" data-close-export>Cancel</button><button type="button" class="primary" id="confirm-export">Export document</button></div>
    </section>`;
    document.body.append(backdrop);
    const chapterWrap = $("#export-chapter-wrap", backdrop);
    $$('input[name="export-scope"]', backdrop).forEach(radio => radio.addEventListener("change", () => {
      chapterWrap.hidden = radio.value !== "chapter" || !radio.checked;
      if (radio.checked) $("#export-summary-title", backdrop).textContent = radio.value === "manuscript" ? "Full manuscript" : radio.value === "chapter" ? "Selected chapter" : "Current document";
    }));
    $$('input[name="export-format"]', backdrop).forEach(radio => radio.addEventListener("change", () => {
      if (radio.checked) $("#export-summary-detail", backdrop).textContent = `${radio.value.toUpperCase()} · ${radio.value === "docx" ? "editable document" : radio.value === "pdf" ? "print-ready" : "plain text"}`;
    }));
    $$("[data-close-export]", backdrop).forEach(button => button.addEventListener("click", () => backdrop.remove()));
    backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
    $("#confirm-export", backdrop).addEventListener("click", () => {
      const selectedScope = $('input[name="export-scope"]:checked', backdrop).value;
      const format = $('input[name="export-format"]:checked', backdrop).value;
      const selectedPath = selectedScope === "chapter" ? $("#export-chapter", backdrop).value : path;
      const titlePage = $("#export-title-page", backdrop).checked;
      const chapterBreaks = $("#export-chapter-breaks", backdrop).checked;
      backdrop.remove();
      if (selectedScope === "manuscript") exportManuscript(format, { titlePage, chapterBreaks });
      else exportDocument(selectedPath, format, { titlePage, chapterBreaks });
    });
  }

  function manuscriptContent() {
    return [...state.files.keys()].filter(path => path.startsWith("Manuscript/") && path.endsWith(".md")).sort((a, b) => a.localeCompare(b))
      .map(path => state.files.get(path).trim())
      .filter(Boolean).join("\n\n---\n\n");
  }

  function exportDocument(path, format, options = {}) {
    const title = path ? basename(path) : $("#document-title").value || "Document";
    const source = path === state.activePath ? currentText() : (state.files.get(path) || `# ${title}\n\n`);
    exportContent(title, source, format, options);
  }

  function exportManuscript(format, options = {}) {
    const title = $("#project-name").textContent || "Manuscript";
    const source = manuscriptContent();
    if (!source) { notify("There are no manuscript chapters to export."); return; }
    exportContent(title, source, format, options);
  }

  function exportContent(title, source, format, options = {}) {
    let body = source;
    if (options.chapterBreaks && source.includes("\n\n---\n\n")) body = source.replace(/\n\n---\n\n/g, "\n\n[[PAGE_BREAK]]\n\n");
    if (options.titlePage) body = `# ${title}\n\n[[TITLE_PAGE_END]]\n\n${body}`;
    if (format === "docx") exportDocx(title, body);
    else if (format === "pdf") exportPdf(title, body, options);
    else if (format === "md") downloadText(`${title}.md`, body.replace(/\n\n\[\[(?:PAGE_BREAK|TITLE_PAGE_END)\]\]\n\n/g, "\n\n---\n\n"), "text/markdown");
  }

  function showApplicationMenu(name, button) {
    $(".menu-popover")?.remove();
    if (name === "Export") {
      openExportDialog();
      return;
    }
    const menu = document.createElement("div");
    menu.className = "menu-popover app-menu-popover";
    const actions = {
      File: [
        ["PROJECTS", [["Project manager…", "projects"], ["Open project folder…", "open-vault"], ["Save current file", "save"]]],
        ["CREATE", [["New chapter", "new-chapter"], ["New character", "new-character"], ["New location", "new-location"], ["New faction", "new-faction"], ["New timeline", "new-timeline"]]]
      ],
      Edit: [
        ["FIND", [["Search vault…", "search"]]],
        ["PREFERENCES", [["Settings…", "settings"]]]
      ],
      Window: [
        ["SIDEBARS", [["Toggle project binder", "toggle-left"], ["Toggle inspector", "toggle-right"]]],
        ["WORKSPACE", [["Plot planner", "plot-planner"], ["Split editor vertically", "split-vertical"], ["Reset layout", "reset-layout"]]]
      ]
    };
    menu.innerHTML = (actions[name] || []).map(([heading, entries]) =>
      `<div class="menu-group"><div class="menu-group-heading">${heading}</div>${entries.map(([label, action]) => `<button data-app-action="${action}">${escapeHtml(label)}</button>`).join("")}</div>`
    ).join("");
    const rect = button.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 225))}px`;
    menu.style.right = "auto";
    menu.addEventListener("click", event => {
      const action = event.target.closest("[data-app-action]")?.dataset.appAction;
      menu.remove();
      if (action) runMenuAction(action);
    });
    document.body.append(menu);
    document.addEventListener("click", function dismiss(event) {
      if (!menu.isConnected || (!menu.contains(event.target) && !event.target.closest(".menu-bar-item"))) {
        menu.remove();
        document.removeEventListener("click", dismiss);
      }
    });
  }

  function runMenuAction(action) {
    if (action === "open-vault") void openVault();
    else if (action === "projects") openProjectManager();
    else if (action === "save") void saveActiveFile();
    else if (action === "new-chapter") newFile("chapter");
    else if (action === "new-character") newFile("character");
    else if (action === "new-location") newFile("location");
    else if (action === "new-faction") newFile("faction");
    else if (action === "new-timeline") newFile("timeline");
    else if (action === "search") setupSearch();
    else if (action === "schema") openSchemaEditor();
    else if (action === "settings") openSettingsDialog();
    else if (action === "goal") void changeGoal();
    else if (action === "toggle-left") document.body.classList.toggle("left-hidden");
    else if (action === "toggle-right") document.body.classList.toggle("right-hidden");
    else if (action === "split-vertical") setupSplit("vertical");
    else if (action === "reset-layout") resetLayout();
    else if (action === "plot-planner") openPlotPlannerView();
    else if (action.startsWith("current-")) openExportDialog({ path: state.activePath });
    else if (action.startsWith("manuscript-")) openExportDialog({ scope: "manuscript" });
  }

  function downloadText(filename, text, mime) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: mime }));
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    notify(`${filename} exported`);
  }

  function xmlEscape(value) {
    return value.replace(/[<>&'"]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]);
  }

  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  }

  function zipStore(files) {
    const encoder = new TextEncoder();
    const locals = [];
    const central = [];
    let offset = 0;
    files.forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(content);
      const checksum = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length + data.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x800, true);
      view.setUint16(8, 0, true);
      view.setUint32(14, checksum, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      local.set(data, 30 + nameBytes.length);
      locals.push(local);
      const directory = new Uint8Array(46 + nameBytes.length);
      const dirView = new DataView(directory.buffer);
      dirView.setUint32(0, 0x02014b50, true);
      dirView.setUint16(4, 20, true);
      dirView.setUint16(6, 20, true);
      dirView.setUint16(8, 0x800, true);
      dirView.setUint32(16, checksum, true);
      dirView.setUint32(20, data.length, true);
      dirView.setUint32(24, data.length, true);
      dirView.setUint16(28, nameBytes.length, true);
      dirView.setUint32(42, offset, true);
      directory.set(nameBytes, 46);
      central.push(directory);
      offset += local.length;
    });
    const centralSize = central.reduce((total, entry) => total + entry.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return new Blob([...locals, ...central, end], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  function exportDocx(title = $("#document-title").value || "Document", source = currentText()) {
    const body = source.split(/\r?\n/).map(line => {
      if (line === "[[PAGE_BREAK]]" || line === "[[TITLE_PAGE_END]]") return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      let style = "";
      if (/^# /.test(line)) { style = '<w:pPr><w:pStyle w:val="Title"/></w:pPr>'; line = line.slice(2); }
      else if (/^## /.test(line)) { style = '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'; line = line.slice(3); }
      else if (/^### /.test(line)) { style = '<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>'; line = line.slice(4); }
      else line = line.replace(/^>\s?/, "").replace(/^[-*]\s+/, "• ").replace(/^\d+[.)]\s+/, "• ");
      const runs = line.split(/(\*\*.*?\*\*|\*.*?\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean).map(part => {
        const bold = /^\*\*.*\*\*$/.test(part);
        const italic = /^\*.*\*$/.test(part) && !bold;
        const linked = /^\[[^\]]+\]\([^)]+\)$/.test(part);
        const clean = linked ? part.match(/^\[([^\]]+)\]/)[1] : part.replace(/^\*\*|\*\*$/g, "").replace(/^\*|\*$/g, "");
        return `<w:r>${bold || italic ? `<w:rPr>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEscape(clean)}</w:t></w:r>`;
      }).join("");
      return `<w:p>${style}${runs || "<w:r><w:t></w:t></w:r>"}</w:p>`;
    }).join("");
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
    const files = [
      ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
      ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
      ["word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ["word/document.xml", documentXml],
      ["word/styles.xml", '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>']
    ];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipStore(files));
    link.download = `${title.replace(/[<>:"/\\|?*]/g, "-")}.docx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    notify("Word document exported");
  }

  function exportPdf(documentTitle = $("#document-title").value || "Document", source = currentText(), options = {}) {
    const title = escapeHtml(documentTitle);
    const paragraphs = source.split(/\r?\n/).map(line => {
      if (line === "[[PAGE_BREAK]]" || line === "[[TITLE_PAGE_END]]") return '<div class="page-break"></div>';
      if (!line.trim()) return "<br>";
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) return `<h${heading[1].length}>${inlineMarkdownHtml(heading[2])}</h${heading[1].length}>`;
      if (/^[-*]\s+/.test(line)) return `<p class="list-item">• ${inlineMarkdownHtml(line.replace(/^[-*]\s+/, ""))}</p>`;
      if (/^\d+[.)]\s+/.test(line)) return `<p class="list-item">${escapeHtml(line.match(/^\d+/)[0])}. ${inlineMarkdownHtml(line.replace(/^\d+[.)]\s+/, ""))}</p>`;
      if (/^>\s?/.test(line)) return `<blockquote>${inlineMarkdownHtml(line.replace(/^>\s?/, ""))}</blockquote>`;
      return `<p>${inlineMarkdownHtml(line)}</p>`;
    }).join("");
    const printWindow = window.open("", "_blank");
    if (!printWindow) { notify("Allow pop-ups to print or save a PDF."); return; }
    printWindow.document.write(`<!doctype html><html><head><title>${title}</title><style>body{max-width:720px;margin:60px auto;font:12pt/1.8 Georgia,serif;color:#222}h1{font-size:28pt}h2{font-size:18pt;margin-top:28px}h3{font-size:14pt;margin-top:22px}p{margin:0 0 1em}.list-item{margin:0 0 .35em 1.5em}blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #999}.page-break{break-before:page}@media print{body{margin:0;max-width:none}${options.chapterBreaks ? "h1:not(:first-of-type){break-before:page}" : ""}}</style></head><body>${paragraphs}<script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  }

  function setDockPanel(panel, target) {
    const element = $(`[data-panel="${panel}"]`);
    const destination = $(`[data-dock="${target}"]`);
    if (!element || !destination) return;
    const rootPanel = element.closest(".panel");
    const targetPanel = destination.querySelector(".panel");
    const isWidget = panel === "timeline" || panel === "lore";
    if (isWidget) {
      if (element.parentElement === destination || (targetPanel && element.parentElement === targetPanel)) return;
      element.classList.add("floating-panel");
      (targetPanel || destination).append(element);
    } else {
      if (rootPanel === targetPanel) return;
      const parent = rootPanel.parentElement;
      destination.append(rootPanel);
      if (parent !== destination && !parent.querySelector(".panel")) parent.classList.add("is-hidden");
    }
    destination.classList.remove("is-hidden");
  }

  function setupDragging() {
    let dragged = "";
    if (!state.defaultDockLocations.size) {
      $$("[data-panel]").forEach(panel => {
        state.defaultDockLocations.set(panel.dataset.panel, {
          element: panel,
          parent: panel.parentElement,
          nextSibling: panel.nextElementSibling
        });
      });
    }
    $$(".panel-drag-handle[data-drag-panel]").forEach(handle => {
      const panel = handle.closest("[data-panel]");
      handle.addEventListener("dragstart", event => {
        dragged = handle.dataset.dragPanel;
        panel?.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", dragged);
      });
      handle.addEventListener("dragend", () => {
        panel?.classList.remove("dragging");
        dragged = "";
      });
    });
    $$("[data-dock]").forEach(column => {
      column.addEventListener("dragover", event => { event.preventDefault(); column.classList.add("dock-target"); });
      column.addEventListener("dragleave", event => { if (!column.contains(event.relatedTarget)) column.classList.remove("dock-target"); });
      column.addEventListener("drop", event => {
        event.preventDefault();
        column.classList.remove("dock-target");
        const panel = event.dataTransfer.getData("text/plain") || dragged;
        setDockPanel(panel, column.dataset.dock);
        dragged = "";
      });
    });
  }

  function setupEvents() {
    if (desktop) {
      $$(".window-control[data-window-action]").forEach(button => {
        button.addEventListener("click", async () => {
          if (button.dataset.windowAction === "close" && state.dirty) {
            clearTimeout(state.saveTimer);
            await saveActiveFile();
            if (state.dirty) return;
          }
          await desktop.controlWindow(button.dataset.windowAction);
        });
      });
      $(".topbar").addEventListener("dblclick", event => {
        if (event.target === event.currentTarget) void desktop.controlWindow("maximize");
      });
      desktop.onWindowState(({ maximized }) => {
        const glyph = $(".maximize-glyph");
        glyph.classList.toggle("is-restored", maximized);
        const button = $('[data-window-action="maximize"]');
        button.title = maximized ? "Restore" : "Maximize";
        button.setAttribute("aria-label", button.title);
      });
    }
    $("#document-content").addEventListener("input", markDirty);
    $("#rich-document-content").addEventListener("input", () => {
      syncRichEditor();
      markDirty();
    });
    $("#rich-document-content").addEventListener("paste", event => {
      const text = event.clipboardData?.getData("text/plain");
      if (text === undefined) return;
      event.preventDefault();
      document.execCommand("insertHTML", false, escapeHtml(text).replace(/\r\n?|\n/g, "<br>"));
      syncRichEditor();
      markDirty();
    });
    document.addEventListener("selectionchange", () => {
      const editor = $("#rich-document-content");
      const selection = window.getSelection();
      if (selection?.rangeCount && selection.anchorNode && editor.contains(selection.anchorNode)) {
        state.editorSelection = selection.getRangeAt(0).cloneRange();
      }
    });
    $("#document-title").addEventListener("input", markDirty);
    $("#project-switcher").addEventListener("click", openProjectManager);
    $("#folder-fallback").addEventListener("change", event => readFallbackFiles(event.target.files));
    $("#search-toggle").addEventListener("click", setupSearch);
    $("#menu-toggle").addEventListener("click", () => {
      const collapsed = document.body.classList.toggle("menu-collapsed");
      const toggle = $("#menu-toggle");
      toggle.innerHTML = collapsed ? "☰ <span>Show menu</span>" : "⌃ <span>Hide menu</span>";
      toggle.title = collapsed ? "Show application menu" : "Hide application menu";
      toggle.setAttribute("aria-label", toggle.title);
      toggle.classList.toggle("menu-toggle-restore", collapsed);
      if (collapsed) $(".top-actions").insertBefore(toggle, $(".window-controls"));
      else $("#app-menu-bar").append(toggle);
    });
    $$(".menu-bar-item").forEach(button => button.addEventListener("click", () => showApplicationMenu(button.dataset.appMenu, button)));
    $("#split-horizontal").addEventListener("click", () => setupSplit("horizontal"));
    $("#split-vertical").addEventListener("click", () => setupSplit("vertical"));
    $("#close-split").addEventListener("click", () => {
      state.splitPath = "";
      $("#split-surface").hidden = true;
      $("#editor-layout").classList.remove("vertical");
      renderSplitTabs();
    });
    $$(".format-toolbar [data-editor-command]").forEach(button => {
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => runEditorCommand(button.dataset.editorCommand, button.dataset.commandValue ? `<${button.dataset.commandValue}>` : ""));
    });
    $("#paragraph-style").addEventListener("change", event => {
      const value = event.target.value;
      runEditorCommand("formatBlock", value === "blockquote" ? "<blockquote>" : `<${value}>`);
      $("#paragraph-style").value = "p";
    });
    $("[data-open-find]").addEventListener("mousedown", event => event.preventDefault());
    $("[data-open-find]").addEventListener("click", openFindReplace);
    $("#new-chapter").addEventListener("click", () => newFile("chapter"));
    $("#new-lore").addEventListener("click", () => showNewLoreMenu());
    $("#new-lore-inline").addEventListener("click", () => showNewLoreMenu());
    $("#new-timeline").addEventListener("click", () => newFile("timeline"));
    $("#new-menu").addEventListener("click", () => showNewLoreMenu());
    $("#add-event").addEventListener("click", () => void addTimelineEvent());
    $("#open-timeline").addEventListener("click", () => {
      openPlotPlannerView();
    });
    $("#change-goal").addEventListener("click", () => void changeGoal());
    $("#goal-settings").addEventListener("click", () => void changeGoal());
    $("#settings-button").addEventListener("click", () => openSettingsDialog());
    $$("[data-collapse]").forEach(button => button.addEventListener("click", () => {
      document.body.classList.toggle(button.dataset.collapse === "left" ? "left-hidden" : "right-hidden");
    }));
    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") { event.preventDefault(); setupSearch(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveActiveFile(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "h") { event.preventDefault(); openFindReplace(); }
      if ($("#rich-document-content").contains(document.activeElement) && (event.ctrlKey || event.metaKey) && ["b", "i"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        runEditorCommand(event.key.toLowerCase() === "b" ? "bold" : "italic");
      }
    });
    setupDragging();
    setupResizing();
  }

  function loadPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "null");
      if (saved && typeof saved === "object") state.preferences = { ...state.preferences, ...saved };
    } catch (error) {
      console.error("Could not load application preferences.", error);
    }
    state.dailyGoal = Number(state.preferences.dailyGoal) || state.dailyGoal;
    applyPreferences();
  }

  function savePreferences() {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(state.preferences));
    } catch (error) {
      console.error("Could not save application preferences.", error);
      notify("Could not save preferences in browser storage.");
    }
  }

  function applyPreferences() {
    document.body.dataset.theme = state.preferences.theme || "dark";
    document.body.dataset.editorWidth = state.preferences.editorWidth || "comfortable";
    document.documentElement.style.setProperty("--editor-font-size", `${Number(state.preferences.editorFontSize) || 14}px`);
    document.documentElement.style.setProperty("--ui-scale", String(Math.min(1.3, Math.max(0.8, Number(state.preferences.uiScale) || 1))));
  }

  function openSettingsDialog(initialCategory = "appearance") {
    $(".dialog-backdrop.settings-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop settings-backdrop";
    backdrop.innerHTML = `<section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header class="settings-header"><div><span class="eyebrow">VERITAS STUDIO</span><h3 id="settings-title">Settings</h3></div><button class="icon-button" data-close-settings aria-label="Close settings">×</button></header>
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="Settings categories">
          <button class="settings-nav-item" data-settings-category="appearance"><span>◐</span> Appearance</button>
          <button class="settings-nav-item" data-settings-category="editor"><span>▤</span> Editor</button>
          <button class="settings-nav-item" data-settings-category="writing"><span>✎</span> Writing</button>
          <button class="settings-nav-item" data-settings-category="templates"><span>◇</span> Templates</button>
          <button class="settings-nav-item" data-settings-category="vault"><span>◈</span> Vault</button>
          <button class="settings-nav-item" data-settings-category="updates"><span>↻</span> Updates</button>
        </nav>
        <div class="settings-content">
          <section class="settings-page" data-settings-page="appearance"><div class="settings-page-heading"><h4>Appearance</h4><p>Set the mood and scale of your writing space.</p></div>
            <label class="setting-row"><span><strong>Color theme</strong><small>Choose a palette for your workspace.</small></span><select id="setting-theme"><option value="dark">Midnight</option><option value="light">Paper</option><option value="sepia">Sepia</option><option value="coffee">Coffee</option><option value="scifi">Sci-Fi</option></select></label>
            <div class="theme-preview-row"><button class="theme-preview" data-theme-choice="dark"><span class="theme-swatch dark-swatch"></span><strong>Midnight</strong><small>Calm and focused</small></button><button class="theme-preview" data-theme-choice="light"><span class="theme-swatch light-swatch"></span><strong>Paper</strong><small>Bright and clear</small></button><button class="theme-preview" data-theme-choice="sepia"><span class="theme-swatch sepia-swatch"></span><strong>Sepia</strong><small>Warm and gentle</small></button><button class="theme-preview" data-theme-choice="coffee"><span class="theme-swatch coffee-swatch"></span><strong>Coffee</strong><small>Roasted and cozy</small></button><button class="theme-preview" data-theme-choice="scifi"><span class="theme-swatch scifi-swatch"></span><strong>Sci-Fi</strong><small>Deep space glow</small></button></div>
            <label class="setting-row scale-setting"><span><strong>Interface scale <output id="setting-scale-value">100%</output></strong><small>Resize menus, panels, controls, and dialogs.</small></span><input id="setting-ui-scale" type="range" min="80" max="130" step="5"></label>
          </section>
          <section class="settings-page" data-settings-page="editor" hidden><div class="settings-page-heading"><h4>Editor</h4><p>Adjust the page for your preferred reading rhythm.</p></div>
            <label class="setting-row"><span><strong>Text size</strong><small>Markdown editing font size.</small></span><select id="setting-font-size"><option value="13">Small</option><option value="14">Default</option><option value="16">Large</option><option value="18">Extra large</option></select></label>
            <label class="setting-row"><span><strong>Writing width</strong><small>Space available for your manuscript.</small></span><select id="setting-editor-width"><option value="narrow">Narrow</option><option value="comfortable">Comfortable</option><option value="wide">Wide</option></select></label>
          </section>
          <section class="settings-page" data-settings-page="writing" hidden><div class="settings-page-heading"><h4>Writing</h4><p>Set goals that keep your project moving.</p></div>
            <label class="setting-row"><span><strong>Daily word goal</strong><small>Used by the writing progress panel.</small></span><input id="setting-daily-goal" type="number" min="1" step="50"></label>
            <div class="settings-note">Your daily progress is stored locally in this browser.</div>
          </section>
          <section class="settings-page" data-settings-page="templates" hidden><div class="settings-page-heading"><h4>Templates & fields</h4><p>Shape the structured data in your worldbuilding notes.</p></div>
            <div class="settings-feature-card"><span class="settings-feature-icon">◇</span><div><strong>Entity schema editor</strong><p>Manage character, location, and faction fields, including dropdown choices.</p></div><button class="primary" id="open-schema-settings">Edit templates</button></div>
          </section>
          <section class="settings-page" data-settings-page="vault" hidden><div class="settings-page-heading"><h4>Vault</h4><p>Manage this project's local workspace.</p></div>
            <label class="setting-row vault-name-setting"><span><strong>Project name</strong><small>Displayed in the application header.</small></span><input id="setting-vault-name" type="text"></label>
            <div class="setting-row"><span><strong>Storage</strong><small>Current workspace storage mode.</small></span><span class="storage-badge" id="settings-storage-mode">Browser vault</span></div>
            <button class="secondary-button" id="settings-open-vault">Open project folder…</button>
          </section>
          <section class="settings-page" data-settings-page="updates" hidden><div class="settings-page-heading"><h4>Updates</h4><p>Check for the latest version of Veritas Studio.</p></div>
            <div class="settings-feature-card update-settings-card"><span class="settings-feature-icon">↻</span><div><strong>Software updates</strong><p>Installed updates download automatically. You can check for a new version at any time.</p><small id="update-check-status" role="status" aria-live="polite">Update checks are available in the installed desktop app.</small></div><div class="update-settings-actions"><button class="primary" id="check-for-updates">Check for updates</button><button class="secondary-button" id="view-update-screen" type="button" hidden>View update</button></div></div>
          </section>
        </div>
      </div>
      <footer class="settings-footer"><span>Preferences are saved on this device.</span><button class="primary settings-done-button" type="button" data-close-settings><span aria-hidden="true">✓</span>Done</button></footer>
    </section>`;
    document.body.append(backdrop);
    const selectPage = name => {
      $$("[data-settings-category]", backdrop).forEach(button => button.classList.toggle("active", button.dataset.settingsCategory === name));
      $$("[data-settings-page]", backdrop).forEach(page => { page.hidden = page.dataset.settingsPage !== name; });
      state.preferences.settingsCategory = name;
      savePreferences();
    };
    $$("[data-settings-category]", backdrop).forEach(button => button.addEventListener("click", () => selectPage(button.dataset.settingsCategory)));
    $$("[data-close-settings]", backdrop).forEach(button => button.addEventListener("click", () => backdrop.remove()));
    backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
    const theme = $("#setting-theme", backdrop);
    theme.value = state.preferences.theme || "dark";
    $$("[data-theme-choice]", backdrop).forEach(button => {
      button.classList.toggle("selected", button.dataset.themeChoice === theme.value);
      button.addEventListener("click", () => {
        theme.value = button.dataset.themeChoice;
        state.preferences.theme = theme.value;
        $$("[data-theme-choice]", backdrop).forEach(choice => choice.classList.toggle("selected", choice === button));
        applyPreferences();
        savePreferences();
      });
    });
    theme.addEventListener("change", () => {
      state.preferences.theme = theme.value;
      $$("[data-theme-choice]", backdrop).forEach(button => button.classList.toggle("selected", button.dataset.themeChoice === theme.value));
      applyPreferences();
      savePreferences();
    });
    const fontSize = $("#setting-font-size", backdrop);
    fontSize.value = state.preferences.editorFontSize || "14";
    fontSize.addEventListener("change", () => { state.preferences.editorFontSize = fontSize.value; applyPreferences(); savePreferences(); });
    const editorWidth = $("#setting-editor-width", backdrop);
    editorWidth.value = state.preferences.editorWidth || "comfortable";
    editorWidth.addEventListener("change", () => { state.preferences.editorWidth = editorWidth.value; applyPreferences(); savePreferences(); });
    const uiScale = $("#setting-ui-scale", backdrop);
    const scaleValue = $("#setting-scale-value", backdrop);
    uiScale.value = String(Math.round((Number(state.preferences.uiScale) || 1) * 100));
    scaleValue.value = `${uiScale.value}%`;
    scaleValue.textContent = `${uiScale.value}%`;
    uiScale.addEventListener("input", () => {
      const scale = Number(uiScale.value) / 100;
      state.preferences.uiScale = scale;
      scaleValue.value = `${uiScale.value}%`;
      scaleValue.textContent = `${uiScale.value}%`;
      applyPreferences();
      savePreferences();
    });
    const dailyGoal = $("#setting-daily-goal", backdrop);
    dailyGoal.value = String(state.dailyGoal);
    dailyGoal.addEventListener("change", () => {
      const value = Number(dailyGoal.value);
      if (!Number.isInteger(value) || value < 1) { dailyGoal.value = String(state.dailyGoal); notify("Enter a whole number greater than zero."); return; }
      state.dailyGoal = value;
      state.preferences.dailyGoal = value;
      persistMetrics();
      persistBrowserState();
      savePreferences();
      updateStats();
    });
    const vaultName = $("#setting-vault-name", backdrop);
    vaultName.value = $("#project-name").textContent;
    vaultName.addEventListener("change", () => {
      const value = vaultName.value.trim();
      if (!value) { vaultName.value = $("#project-name").textContent; return; }
      $("#project-name").textContent = value;
      $("#binder-vault-name").textContent = value;
      const project = activeProject();
      if (project) project.name = value;
      persistProjectCatalog();
      try {
        const config = JSON.parse(state.files.get("config.json") || "{}");
        config.name = value;
        state.files.set("config.json", JSON.stringify(config, null, 2));
        persistBrowserState();
        if (state.dirHandle) void writeVaultFile("config.json", state.files.get("config.json"));
        else state.files.set("config.json", JSON.stringify({ ...config, name: value }, null, 2));
      } catch (error) {
        console.error("Could not update the vault name.", error);
        notify("Could not update project name in config.json.");
      }
    });
    $("#settings-storage-mode", backdrop).textContent = state.dirHandle ? "Local folder" : "Browser workspace";
    if (desktop?.checkForUpdates) applyUpdateState(state.updateState, false);
    $("#settings-open-vault", backdrop).addEventListener("click", () => { backdrop.remove(); void openVault(); });
    $("#view-update-screen", backdrop).addEventListener("click", showUpdateScreen);
    $("#check-for-updates", backdrop).addEventListener("click", async event => {
      const button = event.currentTarget;
      const status = $("#update-check-status", backdrop);
      if (!desktop?.checkForUpdates) {
        status.textContent = "Manual update checks are only available in the installed desktop app.";
        return;
      }
      button.disabled = true;
      button.textContent = "Checking…";
      status.textContent = "Checking for updates…";
      try {
        const result = await desktop.checkForUpdates();
        if (result.status === "available") status.textContent = `Version ${result.version} found. Downloading in the background.`;
        else if (result.status === "current") status.textContent = `You're up to date (version ${result.version}).`;
        else status.textContent = "Update checks are only available in the installed desktop app.";
      } catch (error) {
        console.error("Could not check for updates.", error);
        status.textContent = `Could not check for updates: ${error.message}`;
      } finally {
        button.disabled = false;
        button.textContent = "Check for updates";
      }
    });
    $("#open-schema-settings", backdrop).addEventListener("click", () => { backdrop.remove(); openSchemaEditor(); });
    selectPage(initialCategory || state.preferences.settingsCategory || "appearance");
    return backdrop;
  }

  function resetLayout() {
    state.defaultDockLocations.forEach(({ element, parent, nextSibling }) => {
      if (!parent) return;
      parent.insertBefore(element, nextSibling?.parentElement === parent ? nextSibling : null);
      element.classList.remove("floating-panel");
    });
    document.body.classList.remove("left-hidden", "right-hidden");
    $$(".dock-column").forEach(column => column.classList.remove("is-hidden"));
    $(".workspace").style.removeProperty("--left-width");
    $(".workspace").style.removeProperty("--right-width");
    $("#split-surface").hidden = true;
    $("#editor-layout").classList.remove("vertical");
    state.splitPath = "";
    notify("Layout reset");
  }

  function setupResizing() {
    const workspace = $(".workspace");
    $$(".resize-handle").forEach(handle => {
      handle.addEventListener("pointerdown", event => {
        event.preventDefault();
        const side = handle.classList.contains("left-resize") ? "left" : "right";
        const initial = side === "left"
          ? workspace.getBoundingClientRect().left + parseFloat(getComputedStyle(workspace).getPropertyValue("--left-width"))
          : workspace.getBoundingClientRect().right - parseFloat(getComputedStyle(workspace).getPropertyValue("--right-width"));
        const offset = event.clientX - initial;
        handle.classList.add("resizing");
        handle.setPointerCapture(event.pointerId);
        const move = moveEvent => {
          const rect = workspace.getBoundingClientRect();
          if (side === "left") {
            const width = Math.max(190, Math.min(380, moveEvent.clientX - rect.left - offset));
            workspace.style.setProperty("--left-width", `${width}px`);
          } else {
            const width = Math.max(210, Math.min(390, rect.right - moveEvent.clientX + offset));
            workspace.style.setProperty("--right-width", `${width}px`);
          }
        };
        const stop = () => {
          handle.classList.remove("resizing");
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", stop);
          handle.removeEventListener("pointercancel", stop);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", stop);
        handle.addEventListener("pointercancel", stop);
      });
    });
  }

  function showNewLoreMenu() {
    $(".menu-popover")?.remove();
    const button = $("#new-menu");
    const rect = button.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "menu-popover";
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.right = "auto";
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 175)}px`;
    menu.innerHTML = '<button data-create="character">New character</button><button data-create="location">New location</button><button data-create="faction">New faction</button><button data-create="chapter">New chapter</button><button data-create="timeline">New timeline</button>';
    menu.addEventListener("click", event => {
      const type = event.target.closest("[data-create]")?.dataset.create;
      menu.remove();
      if (type) newFile(type);
    });
    document.body.append(menu);
    setTimeout(() => document.addEventListener("click", function dismiss(event) {
      if (!menu.isConnected || (!menu.contains(event.target) && event.target !== button && !event.target.closest("#new-lore,#new-lore-inline"))) {
        menu.remove();
        document.removeEventListener("click", dismiss);
      }
    }), 0);
  }

  function openSchemaEditor() {
    $(".dialog-backdrop")?.remove();
    const schemas = getSchemas();
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop schema-backdrop";
    backdrop.innerHTML = `<section class="dialog-card schema-card"><h3>Entity schema editor</h3><p>Customize structured fields used by worldbuilding templates. Changes are saved in config.json.</p><label class="schema-type-label">Template<select id="schema-type"><option value="character">Character</option><option value="location">Location</option><option value="faction">Faction</option></select></label><div class="schema-fields" id="schema-fields"></div><form class="schema-add-form" id="schema-add-form"><input id="schema-field-name" placeholder="Field name" required><select id="schema-field-type"><option value="text">Text</option><option value="number">Number</option><option value="dropdown">Dropdown</option><option value="long-text">Long text</option></select><input id="schema-field-options" placeholder="Dropdown options, comma separated" hidden><button class="primary" type="submit">Add field</button></form><div class="dialog-actions"><button type="button" data-close-schema>Done</button></div></section>`;
    const typeSelect = $("#schema-type", backdrop);
    const fieldList = $("#schema-fields", backdrop);
    const addForm = $("#schema-add-form", backdrop);
    const fieldType = $("#schema-field-type", backdrop);
    const optionsInput = $("#schema-field-options", backdrop);
    const renderFields = () => {
      fieldList.replaceChildren();
      (schemas[typeSelect.value] || []).forEach((field, index) => {
        const row = document.createElement("div");
        row.className = "schema-field-row";
        row.innerHTML = `<span>${escapeHtml(field.name)}</span><small>${escapeHtml(field.type)}${field.type === "dropdown" ? ` · ${escapeHtml((field.options || []).join(", "))}` : ""}</small>${field.name.toLowerCase() === "name" ? "<small>Required</small>" : `<button type="button" aria-label="Remove ${escapeHtml(field.name)}" data-remove-field="${index}">×</button>`}`;
        fieldList.append(row);
      });
    };
    const persistSchemas = async () => {
      try {
        let config = {};
        try { config = JSON.parse(state.files.get("config.json") || "{}"); }
        catch (error) { throw new Error(`config.json is invalid: ${error.message}`); }
        config.schemas = schemas;
        state.files.set("config.json", JSON.stringify(config, null, 2));
        if (state.dirHandle) await writeVaultFile("config.json", state.files.get("config.json"));
        persistBrowserState();
        if (isEntityPath(state.activePath)) renderEntityFields(state.activePath);
        notify("Entity templates saved");
      } catch (error) {
        console.error("Could not save entity schemas.", error);
        notify(`Could not save templates: ${error.message}`);
      }
    };
    typeSelect.addEventListener("change", renderFields);
    fieldType.addEventListener("change", () => { optionsInput.hidden = fieldType.value !== "dropdown"; });
    fieldList.addEventListener("click", event => {
      const button = event.target.closest("[data-remove-field]");
      if (!button) return;
      if (schemas[typeSelect.value][Number(button.dataset.removeField)]?.name.toLowerCase() === "name") return;
      schemas[typeSelect.value].splice(Number(button.dataset.removeField), 1);
      renderFields();
      void persistSchemas();
    });
    addForm.addEventListener("submit", event => {
      event.preventDefault();
      const name = $("#schema-field-name", backdrop).value.trim();
      if (!name) return;
      const fields = schemas[typeSelect.value];
      if (fields.some(field => field.name.toLowerCase() === name.toLowerCase())) {
        notify("A field with that name already exists.");
        return;
      }
      const type = fieldType.value;
      const field = { name, type };
      if (type === "dropdown") {
        field.options = optionsInput.value.split(",").map(option => option.trim()).filter(Boolean);
        if (!field.options.length) { notify("Add at least one dropdown option."); return; }
      }
      fields.push(field);
      addForm.reset();
      optionsInput.hidden = true;
      renderFields();
      void persistSchemas();
    });
    $("[data-close-schema]", backdrop).addEventListener("click", () => backdrop.remove());
    backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
    document.body.append(backdrop);
    renderFields();
  }

  async function changeGoal() {
    const value = await promptDialog("Daily writing goal", "Words per day", String(state.dailyGoal));
    if (value === null) return;
    const goal = Number(value);
    if (!Number.isInteger(goal) || goal < 1) { notify("Enter a whole number greater than zero."); return; }
    state.dailyGoal = goal;
    persistMetrics();
    persistBrowserState();
    updateStats();
    notify("Daily goal updated");
  }

  async function init() {
    loadPreferences();
    setupEvents();
    if (desktop?.onUpdateState) {
      desktop.onUpdateState(update => applyUpdateState(update));
      try {
        applyUpdateState(await desktop.getUpdateState());
      } catch (error) {
        console.error("Could not read update status.", error);
      }
    }
    loadProjectCatalog();
    let restored = false;
    try {
      restored = await restoreDirectoryHandle();
    } catch (error) {
      console.error("Could not restore the active project folder.", error);
      if (desktop) {
        setStatus("Project folder unavailable");
        notify(`Could not open project folder: ${error.message}`);
      } else throw error;
    }
    if (restored) {
      restoreMetrics();
      renderAll();
      const firstChapter = [...state.files.keys()].find(path => category(path) === "chapter");
      if (firstChapter) openFile(firstChapter);
      else if (state.files.size) openFile(state.files.keys().next().value);
      $("#session-count").textContent = "Today 0 words";
    }
  }

  void init();
})();
