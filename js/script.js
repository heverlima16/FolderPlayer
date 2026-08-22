// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let courseData          = { name: "", root: null }; // root: nodo carpeta raíz del árbol { type:"folder", name, path, children:[] }
let currentLessonIndex  = -1;
let allLessons          = [];
let isPlaying           = false;
let currentMedia        = null;
let playbackSpeed       = localStorage.getItem("playbackSpeed")
                          ? parseFloat(localStorage.getItem("playbackSpeed")) : 1;
let autoplay            = localStorage.getItem("autoplay") === "true";
let completedLessons    = new Set();
let theme               = "system";
let expandedFolders     = new Set(); // rutas ("A/B") de carpetas expandidas en el árbol del sidebar
let controlsTimeout;
let controlsBtnTimeout;
let currentVolume       = 100;
let isMuted             = false;
let lastVolume          = 100;
let videoProgress       = {};
let lastProgressSaveTime = 0;
let isPipActive         = false;
let pipVideo            = null;
let currentBlobUrl      = null; // para revocar el blob URL del video activo
let videoListenersAbort = null; // limpia los listeners del <video> cuando se reutiliza (ver PiP nativo)
let courseState         = {}; // { [courseName]: { lastLesson, completed: [names] } } — para retomar donde quedó al recargar la misma carpeta

// ══════════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════════
const folderInput          = document.getElementById("folderInput");
const loadFolderBtn        = document.getElementById("loadFolder");
const sidebar              = document.getElementById("sidebar");
const mobileSidebarToggle  = document.getElementById("mobileSidebarToggle");
const sidebarBackdrop      = document.getElementById("sidebarBackdrop");
const contentArea          = document.getElementById("contentArea");
const sidebarContent       = document.getElementById("sidebarContent");
const courseName           = document.getElementById("courseName");
const sbCourseTitle        = document.getElementById("sbCourseTitle");
const currentLessonEl      = document.getElementById("currentLesson");
const headerSep            = document.getElementById("headerSep");
const playPauseBtn         = document.getElementById("playPauseBtn");
const speedBtn             = document.getElementById("speedBtn");
const timeDisplay          = document.getElementById("timeDisplay");
const progressBarContainer = document.getElementById("progressBarContainer");
const progressFilled       = document.getElementById("progressFilled");
const progressBuffer       = document.getElementById("progressBuffer");
const prevLessonBtn        = document.getElementById("prevLesson");
const nextLessonBtn        = document.getElementById("nextLesson");
const rewindBtn            = document.getElementById("rewindBtn");
const forwardBtn           = document.getElementById("forwardBtn");
const settingsBtn          = document.getElementById("settingsBtn");
const fullscreenBtn        = document.getElementById("fullscreenBtn");
const settingsMenu         = document.getElementById("settingsMenu");
const toggleSwitch         = document.getElementById("toggleSwitch");
const themeMenuItem        = document.getElementById("themeMenuItem");
const themeSubmenu         = document.getElementById("themeSubmenu");
const autoplayMenuItem     = document.getElementById("autoplayMenuItem");
const videoSection         = document.querySelector(".video-section");
const volumeBtn            = document.getElementById("volumeBtn");
const volumeSliderContainer = document.getElementById("volumeSliderContainer");
const volumeSlider         = document.getElementById("volumeSlider");
const volumePercentage     = document.getElementById("volumePercentage");
const pipBtn               = document.getElementById("pipBtn");
const customPipBtn         = document.getElementById("customPipBtn");
const pipOverlay           = document.getElementById("pipOverlay");
const pipVideoContainer    = document.getElementById("pipVideoContainer");
const pipTitle             = document.getElementById("pipTitle");
const pipClose             = document.getElementById("pipClose");
const pipMinimize          = document.getElementById("pipMinimize");
const pipRewind            = document.getElementById("pipRewind");
const pipForward           = document.getElementById("pipForward");
const pipPrev              = document.getElementById("pipPrev");
const pipNext              = document.getElementById("pipNext");
const pipHeader            = document.getElementById("pipHeader");
const controlsOverlay      = document.querySelector(".controls-overlay");
const globalProgressFill   = document.getElementById("globalProgressFill");
const globalProgressPct    = document.getElementById("globalProgressPct");
const locateLessonBtn      = document.getElementById("locateLesson");
const autoplayBtn          = document.getElementById("autoplayBtn");
const pauseOverlay         = document.getElementById("pauseOverlay");
const completeBtn          = document.getElementById("completeBtn");
const rewatchBtn           = document.getElementById("rewatchBtn");
const sidebarSearch        = document.getElementById("sidebarSearch");
const sidebarSearchClear   = document.getElementById("sidebarSearchClear");

// ══════════════════════════════════════════
// PROGRESS PERSISTENCE
// ══════════════════════════════════════════
function loadProgress() {
  const saved = localStorage.getItem("videoProgress");
  if (saved) {
    try { videoProgress = JSON.parse(saved); }
    catch (e) { videoProgress = {}; }
  }
}

function saveProgress() {
  try { localStorage.setItem("videoProgress", JSON.stringify(videoProgress)); }
  catch (e) {}
}

loadProgress();

// ══════════════════════════════════════════
// COURSE STATE (última lección vista + completados, por carpeta)
// ══════════════════════════════════════════
function loadCourseState() {
  const saved = localStorage.getItem("courseState");
  if (saved) {
    try { courseState = JSON.parse(saved); }
    catch (e) { courseState = {}; }
  }
}

function saveCourseState() {
  if (!courseData.name) return;
  const completedPaths = [...completedLessons]
    .map((i) => allLessons[i] && allLessons[i].path)
    .filter(Boolean);
  const lastLesson = currentLessonIndex >= 0 && allLessons[currentLessonIndex]
    ? allLessons[currentLessonIndex].path : undefined;

  const entry = courseState[courseData.name] || {};
  if (lastLesson) entry.lastLesson = lastLesson;
  entry.completed = completedPaths;
  courseState[courseData.name] = entry;

  try { localStorage.setItem("courseState", JSON.stringify(courseState)); }
  catch (e) {}
}

loadCourseState();

// ══════════════════════════════════════════
// FOLDER LOADING
// ══════════════════════════════════════════
const supportsFSAccess = "showDirectoryPicker" in window;

loadFolderBtn.addEventListener("click", () => {
  if (supportsFSAccess) loadFolderViaFSAccess();
  else folderInput.click();
});

folderInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  await processFolder(files);
});

async function loadFolderViaFSAccess() {
  let dirHandle;
  try { dirHandle = await window.showDirectoryPicker(); }
  catch (e) { return; } // el usuario canceló el selector

  await saveDirHandle(dirHandle);
  const files = await collectFilesFromHandle(dirHandle);
  if (files.length > 0) await processFolder(files);
}

// ══════════════════════════════════════════
// RETOMAR LA ÚLTIMA CARPETA AL REABRIR (File System Access API)
// ══════════════════════════════════════════
const HANDLE_DB_NAME  = "FolderPlayerDB";
const HANDLE_DB_STORE = "handles";
const HANDLE_DB_KEY   = "lastFolder";

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function saveDirHandle(handle) {
  try {
    const db = await openHandleDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_DB_STORE, "readwrite");
      tx.objectStore(HANDLE_DB_STORE).put(handle, HANDLE_DB_KEY);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch (e) {}
}

async function loadDirHandle() {
  try {
    const db = await openHandleDB();
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(HANDLE_DB_STORE, "readonly");
      const req = tx.objectStore(HANDLE_DB_STORE).get(HANDLE_DB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) { return null; }
}

// Recorre el árbol de la carpeta y arma un array de File con webkitRelativePath,
// para poder reutilizar processFolder() tal cual funciona con <input webkitdirectory>
async function collectFilesFromHandle(dirHandle) {
  const files = [];
  async function walk(handle, relPath) {
    for await (const [name, entry] of handle.entries()) {
      const entryPath = relPath ? `${relPath}/${name}` : name;
      if (entry.kind === "directory") {
        await walk(entry, entryPath);
      } else {
        try {
          const file = await entry.getFile();
          Object.defineProperty(file, "webkitRelativePath", { value: entryPath, configurable: true });
          files.push(file);
        } catch (e) {}
      }
    }
  }
  await walk(dirHandle, dirHandle.name);
  return files;
}

async function resumeFromHandle(handle, autoplay) {
  try {
    const files = await collectFilesFromHandle(handle);
    if (files.length > 0) await processFolder(files, { autoplay });
  } catch (e) {}
}

// Mientras el usuario no interactúa no hay "gesto de usuario", así que el navegador
// no deja re-pedir permiso solo: se muestra un botón de un clic para confirmarlo.
// Como ese clic ya es una acción explícita de "seguir viendo", el video arranca
// reproduciéndose (a diferencia del retomo 100% silencioso, que queda en pausa).
function showResumeBanner(handle) {
  contentArea.innerHTML = `
    <div class="placeholder">
      <div class="placeholder-icon"><span class="material-icons-round">folder_open</span></div>
      <h3>Continuar con «${escapeHtml(handle.name)}»</h3>
      <p>El navegador pide confirmar el acceso a esta carpeta con un clic.</p>
      <button class="hbtn resume-btn" id="resumeFolderBtn">
        <span class="material-icons-round">play_circle</span>Continuar donde quedé
      </button>
    </div>`;
  document.getElementById("resumeFolderBtn").addEventListener("click", async () => {
    let granted;
    try { granted = await handle.requestPermission({ mode: "read" }); }
    catch (e) { return; }
    if (granted === "granted") await resumeFromHandle(handle, true);
  });
}

async function tryAutoResumeLastFolder() {
  if (!supportsFSAccess) return;
  const handle = await loadDirHandle();
  if (!handle) return;

  let permission;
  try { permission = await handle.queryPermission({ mode: "read" }); }
  catch (e) { return; }

  if (permission === "granted") await resumeFromHandle(handle, false);
  else showResumeBanner(handle);
}

tryAutoResumeLastFolder();

// ══════════════════════════════════════════
// FILE TYPE HELPERS
// ══════════════════════════════════════════
const VIDEO_EXTS = [
  "mp4","webm","ogg","mov","avi",
  "mkv","m4v","3gp","3g2","ts","mts","m2ts",
  "mpg","mpeg","m2v","mp2","mpe","mpv",
  "wmv","asf","flv","f4v","vob","ogv",
  "dv","qt","divx","xvid","rmvb","rm",
];

// "ogg" ya pertenece a VIDEO_EXTS (Ogg Theora), por eso se excluye aquí
const AUDIO_EXTS = [
  "mp3","wav","wave","m4a","aac","flac",
  "oga","opus","wma","weba","aiff","aif","amr",
];

const MIME_MAP = {
  mp4:"video/mp4", m4v:"video/mp4", f4v:"video/mp4",
  webm:"video/webm",
  ogg:"video/ogg", ogv:"video/ogg",
  mov:"video/quicktime", qt:"video/quicktime",
  avi:"video/x-msvideo",
  mkv:"video/x-matroska",
  wmv:"video/x-ms-wmv", asf:"video/x-ms-asf",
  flv:"video/x-flv",
  "3gp":"video/3gpp", "3g2":"video/3gpp2",
  ts:"video/mp2t", mts:"video/mp2t", m2ts:"video/mp2t",
  mpg:"video/mpeg", mpeg:"video/mpeg", m2v:"video/mpeg", mpe:"video/mpeg", mpv:"video/mpeg",
  vob:"video/dvd",
  dv:"video/x-dv",
};

function getVideoMime(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  return MIME_MAP[ext] || "video/*";
}

function getFileType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  if (VIDEO_EXTS.includes(ext))                                                                  return "video";
  if (AUDIO_EXTS.includes(ext))                                                                  return "audio";
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext))                                     return "image";
  if (["js","html","htm","css","json","py","java","cpp","sql","c","txt","md","markdown"].includes(ext)) return "code";
  if (ext === "pdf")                                                                              return "pdf";
  return "unknown";
}

function getTypeIcon(type, filename) {
  if (filename) {
    const ext = filename.split(".").pop().toLowerCase();
    if (["html","htm"].includes(ext)) return "language";
    if (["md","markdown"].includes(ext)) return "article";
  }
  const map = { video:"play_circle", audio:"headphones", image:"image", code:"code", pdf:"description", unknown:"attach_file" };
  return map[type] || "attach_file";
}

function getLanguageName(ext) {
  const languages = {
    js:"JavaScript", py:"Python", java:"Java", cpp:"C++", c:"C", cs:"C#",
    html:"HTML", htm:"HTML", css:"CSS", sql:"SQL", json:"JSON", xml:"XML", php:"PHP",
    rb:"Ruby", go:"Go", rs:"Rust", ts:"TypeScript", jsx:"React JSX", tsx:"React TSX",
    md:"Markdown", markdown:"Markdown", txt:"Text", sh:"Shell", bash:"Bash", yml:"YAML", yaml:"YAML",
  };
  return languages[ext] || ext.toUpperCase();
}

// ══════════════════════════════════════════
// PROCESS FOLDER
// ══════════════════════════════════════════
function naturalSort(a, b) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

function getMediaDuration(file, type) {
  return new Promise((resolve) => {
    const media = document.createElement(type === "audio" ? "audio" : "video");
    media.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);
    media.onloadedmetadata = () => { URL.revokeObjectURL(objectUrl); resolve(formatTime(media.duration)); };
    media.onerror          = () => { URL.revokeObjectURL(objectUrl); resolve(""); };
    media.src = objectUrl;
  });
}

async function processFolder(files, opts = {}) {
  const rootPath  = files[0].webkitRelativePath.split("/")[0];
  const validExts = [...VIDEO_EXTS, ...AUDIO_EXTS, "pdf","js","html","htm","css","json","py","java","cpp","sql","c","txt","md","markdown","jpg","jpeg","png","gif","webp","svg"];
  const excluded  = [".DS_Store","Thumbs.db",".gitignore"];

  // ── Construir el árbol de carpetas/archivos (profundidad arbitraria) ──
  const root = { type: "folder", name: rootPath, path: "", children: [] };

  files.forEach((file) => {
    if (excluded.includes(file.name)) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!validExts.includes(ext)) return;

    const parts = file.webkitRelativePath.split("/");
    parts.shift(); // quitar el nombre de la carpeta raíz

    let node    = root;
    let pathAcc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      pathAcc     = pathAcc ? `${pathAcc}/${parts[i]}` : parts[i];
      let child   = node.children.find((c) => c.type === "folder" && c.name === parts[i]);
      if (!child) {
        child = { type: "folder", name: parts[i], path: pathAcc, children: [] };
        node.children.push(child);
      }
      node = child;
    }

    const fileName   = parts[parts.length - 1];
    const lessonPath = pathAcc ? `${pathAcc}/${fileName}` : fileName;
    node.children.push({ type: getFileType(fileName), name: fileName, path: lessonPath, file, duration: "" });
  });

  // Carpetas primero (orden natural), luego archivos (orden natural) — en cada nivel
  function sortTree(node) {
    node.children.sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      return naturalSort(a, b);
    });
    node.children.forEach((c) => { if (c.type === "folder") sortTree(c); });
  }
  sortTree(root);

  async function fillDurations(node) {
    for (const child of node.children) {
      if (child.type === "folder") await fillDurations(child);
      else if (child.type === "video" || child.type === "audio") {
        child.duration = await getMediaDuration(child.file, child.type);
      }
    }
  }
  await fillDurations(root);

  function flattenLessons(node, out) {
    node.children.forEach((child) => {
      if (child.type === "folder") flattenLessons(child, out);
      else out.push(child);
    });
    return out;
  }

  courseData.name = rootPath;
  courseData.root = root;
  allLessons       = flattenLessons(root, []);

  courseName.textContent   = courseData.name;
  sbCourseTitle.textContent = courseData.name;

  // Retomar completados, última lección vista y carpetas abiertas de esta misma carpeta (por ruta)
  const savedState = courseState[courseData.name];
  completedLessons = new Set();
  expandedFolders  = new Set();
  let startIndex = 0;
  if (savedState) {
    if (Array.isArray(savedState.completed)) {
      allLessons.forEach((lesson, idx) => {
        if (savedState.completed.includes(lesson.path)) completedLessons.add(idx);
      });
    }
    if (savedState.lastLesson) {
      const idx = allLessons.findIndex((l) => l.path === savedState.lastLesson);
      if (idx >= 0) startIndex = idx;
    }
  }
  if (allLessons[startIndex]) {
    // Abrir en el árbol las carpetas que contienen la lección donde se retoma
    const segs = allLessons[startIndex].path.split("/");
    segs.pop();
    let acc = "";
    segs.forEach((s) => { acc = acc ? `${acc}/${s}` : s; expandedFolders.add(acc); });
  }

  renderSidebar();
  if (allLessons.length > 0) loadLesson(startIndex, { autoplay: opts.autoplay !== false });
}

// ══════════════════════════════════════════
// RENDER SIDEBAR
// ══════════════════════════════════════════
function renderSidebar() {
  // Si hay búsqueda activa, refrescar resultados en vez del árbol completo
  if (searchQuery && searchQuery.trim()) { renderSearch(searchQuery); return; }
  sidebarContent.innerHTML = "";

  if (!courseData.root) {
    sidebarContent.innerHTML = `
      <div style="padding:24px 16px;text-align:center;color:var(--text3);font-size:13px">
        No hay contenido cargado
      </div>`;
    updateGlobalProgress();
    return;
  }

  const r    = 11;
  const circ = 2 * Math.PI * r; // ~69.115

  // Índice global de cada lección — el árbol se recorre en el mismo orden que allLessons
  const nodeIndex = new Map();
  allLessons.forEach((lesson, i) => nodeIndex.set(lesson, i));

  // Carpetas ancestro de la lección activa, para resaltarlas en el árbol
  const activeAncestorPaths = new Set();
  const activeLesson = currentLessonIndex >= 0 ? allLessons[currentLessonIndex] : null;
  if (activeLesson) {
    const segs = activeLesson.path.split("/");
    segs.pop();
    let acc = "";
    segs.forEach((s) => { acc = acc ? `${acc}/${s}` : s; activeAncestorPaths.add(acc); });
  }

  function folderStats(node) {
    let total = 0, completed = 0;
    node.children.forEach((child) => {
      if (child.type === "folder") {
        const s = folderStats(child);
        total += s.total; completed += s.completed;
      } else {
        total++;
        if (completedLessons.has(nodeIndex.get(child))) completed++;
      }
    });
    return { total, completed };
  }

  function renderLesson(lesson, displayNumber, container, trackFirst, trackLast) {
    const globalIndex    = nodeIndex.get(lesson);
    const isActiveLesson = globalIndex === currentLessonIndex;
    const isDone          = completedLessons.has(globalIndex);

    const itemEl = document.createElement("div");
    itemEl.className     = `lesson-item${isDone ? " completed" : ""}${isActiveLesson ? " active" : ""}${trackFirst ? " track-first" : ""}${trackLast ? " track-last" : ""}`;
    itemEl.dataset.path  = lesson.path;

    // Number badge (checkmark if done, active accent if current)
    const numContent = isDone
      ? `<span class="material-icons-round" style="font-size:12px">check</span>`
      : String(displayNumber);

    // Progress bar (video/audio only)
    const isPlayable = lesson.type === "video" || lesson.type === "audio";
    const progressEl = isPlayable ? `
      <div class="lesson-progress">
        <div class="lesson-progress-fill" style="width:${getVideoProgress(lesson.path)}%"></div>
      </div>` : "";

    // Resource button (non-playable files)
    const resourceBtn = !isPlayable ? `
      <button class="resource-btn" onclick="downloadResource(${globalIndex})">Descargar</button>` : "";

    itemEl.innerHTML = `
      <div class="lesson-track"><div class="lesson-num">${numContent}</div></div>
      <div class="lesson-info">
        <div class="lesson-title">${escapeHtml(lesson.name)}</div>
        <div class="lesson-dur">${lesson.duration || (lesson.type !== "video" ? lesson.type : "")}</div>
        ${progressEl}
        ${resourceBtn}
      </div>
      <span class="material-icons-round lesson-type-icon">${getTypeIcon(lesson.type, lesson.name)}</span>
    `;

    itemEl.addEventListener("click", () => {
      loadLesson(globalIndex);
      if (lesson.type !== "video" && lesson.type !== "audio") {
        completedLessons.add(globalIndex);
        renderSidebar();
        updateGlobalProgress();
      }
      closeMobileSidebar();
    });

    container.appendChild(itemEl);
  }

  function renderFolder(node, container) {
    const stats      = folderStats(node);
    const pct        = stats.total > 0 ? stats.completed / stats.total : 0;
    const ringOffset = circ * (1 - pct);
    const isExpanded = expandedFolders.has(node.path);
    const isActive   = activeAncestorPaths.has(node.path);

    const moduleEl = document.createElement("div");
    moduleEl.className = "module";

    const headerEl = document.createElement("div");
    headerEl.className = `module-header${isActive ? " active-module" : ""}`;
    headerEl.innerHTML = `
      <span class="material-icons-round module-chevron${isExpanded ? " open" : ""}">chevron_right</span>
      <div class="module-info">
        <div class="module-name">${escapeHtml(node.name)}</div>
        <div class="module-meta">${stats.completed}/${stats.total} clases</div>
      </div>
      <div class="module-progress-ring">
        <svg width="28" height="28" viewBox="0 0 28 28">
          <circle class="ring-bg"   cx="14" cy="14" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="0"/>
          <circle class="ring-fill" cx="14" cy="14" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${ringOffset}"/>
        </svg>
      </div>
    `;

    headerEl.addEventListener("click", () => {
      if (expandedFolders.has(node.path)) {
        expandedFolders.delete(node.path);
      } else {
        expandedFolders.add(node.path);
      }
      renderSidebar();
    });

    const childrenEl = document.createElement("div");
    childrenEl.className = `lessons${isExpanded ? " open" : ""}`;

    let lessonCounter = 0;
    node.children.forEach((child, i) => {
      if (child.type === "folder") renderFolder(child, childrenEl);
      else {
        const trackFirst = i === 0 || node.children[i - 1].type === "folder";
        const trackLast  = i === node.children.length - 1 || node.children[i + 1].type === "folder";
        renderLesson(child, ++lessonCounter, childrenEl, trackFirst, trackLast);
      }
    });

    moduleEl.appendChild(headerEl);
    moduleEl.appendChild(childrenEl);
    container.appendChild(moduleEl);
  }

  let rootLessonCounter = 0;
  const rootChildren = courseData.root.children;
  rootChildren.forEach((child, i) => {
    if (child.type === "folder") renderFolder(child, sidebarContent);
    else {
      const trackFirst = i === 0 || rootChildren[i - 1].type === "folder";
      const trackLast  = i === rootChildren.length - 1 || rootChildren[i + 1].type === "folder";
      renderLesson(child, ++rootLessonCounter, sidebarContent, trackFirst, trackLast);
    }
  });

  updateGlobalProgress();
}

// ══════════════════════════════════════════
// GLOBAL PROGRESS
// ══════════════════════════════════════════
function updateGlobalProgress() {
  const total = allLessons.length;
  if (total === 0) { globalProgressFill.style.width = "0%"; globalProgressPct.textContent = "0%"; return; }
  const pct = Math.round((completedLessons.size / total) * 100);
  globalProgressFill.style.width = pct + "%";
  globalProgressPct.textContent  = pct + "%";
  saveCourseState();
}

// ══════════════════════════════════════════
// SIDEBAR MÓVIL (drawer superpuesto sobre el video en pantallas chicas)
// ══════════════════════════════════════════
function openMobileSidebar() {
  sidebar.classList.add("mobile-open");
  sidebarBackdrop.classList.add("visible");
}

function closeMobileSidebar() {
  sidebar.classList.remove("mobile-open");
  sidebarBackdrop.classList.remove("visible");
}

mobileSidebarToggle.addEventListener("click", () => {
  if (sidebar.classList.contains("mobile-open")) closeMobileSidebar();
  else openMobileSidebar();
});

sidebarBackdrop.addEventListener("click", closeMobileSidebar);

// ══════════════════════════════════════════
// SIDEBAR SEARCH
// ══════════════════════════════════════════
let searchQuery = "";

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])
  );
}

function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex   = new RegExp(`(${escaped})`, "gi");
  return escapeHtml(text).replace(
    new RegExp(`(${escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
    (m) => `<span class="search-highlight">${m}</span>`
  );
}

function renderSearch(query) {
  sidebarContent.innerHTML = "";
  const q = query.trim().toLowerCase();

  if (!q) { renderSidebar(); return; }

  // Construir mapa lessonIndex → ruta de carpetas (breadcrumb), para distinguir
  // archivos con el mismo nombre en distintas subcarpetas
  const moduleOf = {};
  allLessons.forEach((lesson, idx) => {
    const segs = lesson.path.split("/");
    segs.pop();
    moduleOf[idx] = segs.length > 0 ? segs.join(" › ") : courseData.name;
  });

  const matches = allLessons
    .map((lesson, idx) => ({ lesson, idx }))
    .filter(({ lesson }) => lesson.name.toLowerCase().includes(q));

  if (matches.length === 0) {
    sidebarContent.innerHTML = `
      <div class="search-results-empty">
        <span class="material-icons-round" style="font-size:32px;opacity:.3;display:block;margin-bottom:8px">search_off</span>
        Sin resultados para "<strong>${escapeHtml(query)}</strong>"
      </div>`;
    return;
  }

  matches.forEach(({ lesson, idx }) => {
    const isActive = idx === currentLessonIndex;
    const item = document.createElement("div");
    item.className = `search-result-item${isActive ? " active" : ""}`;
    item.innerHTML = `
      <div class="search-result-icon">
        <span class="material-icons-round">${getTypeIcon(lesson.type, lesson.name)}</span>
      </div>
      <div class="search-result-info">
        <div class="search-result-name">${highlightMatch(lesson.name, query)}</div>
        <div class="search-result-meta">${escapeHtml(moduleOf[idx] || "")}${lesson.duration ? " · " + lesson.duration : ""}</div>
      </div>`;

    item.addEventListener("click", () => {
      loadLesson(idx);
      if (lesson.type !== "video" && lesson.type !== "audio") {
        completedLessons.add(idx);
        updateGlobalProgress();
      }
      // Marcar activo visualmente sin limpiar la búsqueda
      sidebarContent.querySelectorAll(".search-result-item").forEach((el) =>
        el.classList.remove("active")
      );
      item.classList.add("active");
      closeMobileSidebar();
    });

    sidebarContent.appendChild(item);
  });
}

sidebarSearch.addEventListener("input", () => {
  searchQuery = sidebarSearch.value;
  sidebarSearchClear.style.display = searchQuery ? "flex" : "none";
  renderSearch(searchQuery);
});

sidebarSearch.addEventListener("keydown", (e) => {
  if (e.key === "Escape") clearSearch();
});

sidebarSearchClear.addEventListener("click", clearSearch);

function clearSearch() {
  sidebarSearch.value = "";
  searchQuery = "";
  sidebarSearchClear.style.display = "none";
  renderSidebar();
  sidebarSearch.focus();
}

// Redefinir renderSidebar para que respete una búsqueda activa
const _renderSidebarOrig = renderSidebar;
// (renderSearch ya llama a renderSidebar internamente cuando query vacío)

// ══════════════════════════════════════════
// COLLAPSE / EXPAND ALL
// ══════════════════════════════════════════
document.getElementById("collapseAll").addEventListener("click", () => {
  expandedFolders.clear();
  renderSidebar();
});

document.getElementById("expandAll").addEventListener("click", () => {
  expandedFolders.clear();
  function collectFolderPaths(node) {
    node.children.forEach((c) => {
      if (c.type === "folder") { expandedFolders.add(c.path); collectFolderPaths(c); }
    });
  }
  if (courseData.root) collectFolderPaths(courseData.root);
  renderSidebar();
});

// ══════════════════════════════════════════
// LOCATE CURRENT LESSON
// ══════════════════════════════════════════
locateLessonBtn.addEventListener("click", () => {
  if (currentLessonIndex < 0 || !allLessons[currentLessonIndex]) return;

  // Expand every ancestor folder of the current lesson so it becomes visible
  const segs = allLessons[currentLessonIndex].path.split("/");
  segs.pop();
  let acc = "";
  segs.forEach((s) => { acc = acc ? `${acc}/${s}` : s; expandedFolders.add(acc); });

  renderSidebar();

  // Scroll to active item
  const activeItem = sidebarContent.querySelector(".lesson-item.active");
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

// ══════════════════════════════════════════
// VIDEO PROGRESS
// ══════════════════════════════════════════
function getVideoProgress(videoPath) {
  return videoProgress[videoPath] ? Math.round(videoProgress[videoPath].progress) : 0;
}

function updateVideoProgress(videoPath, currentTime, duration) {
  if (!videoPath || !duration) return;

  const progress = (currentTime / duration) * 100;
  videoProgress[videoPath] = { currentTime, duration, progress, lastUpdate: Date.now() };

  // Update sidebar bar without full re-render (por ruta única, no por nombre —
  // dos archivos en subcarpetas distintas pueden llamarse igual)
  const item = sidebarContent.querySelector(`.lesson-item[data-path="${CSS.escape(videoPath)}"]`);
  if (item) {
    const bar = item.querySelector(".lesson-progress-fill");
    if (bar) bar.style.width = Math.round(progress) + "%";
  }

  // Throttled save
  const now = Date.now();
  if (now - lastProgressSaveTime > 5000) {
    saveProgress();
    lastProgressSaveTime = now;
  }
}

// ══════════════════════════════════════════
// DOWNLOAD RESOURCE
// ══════════════════════════════════════════
function downloadResource(index) {
  const lesson = allLessons[index];
  const url = URL.createObjectURL(lesson.file);
  const a = document.createElement("a");
  a.href = url; a.download = lesson.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════
// COPY CODE
// ══════════════════════════════════════════
function copyCodeToClipboard(button) {
  const container = button.closest(".code-display");
  const text      = container ? container.dataset.code : "";
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const copyText = button.querySelector(".copy-text");
    const icon     = button.querySelector(".material-icons-round");
    button.classList.add("copied");
    if (copyText) copyText.textContent = "Copiado";
    if (icon) icon.textContent = "check";
    setTimeout(() => {
      button.classList.remove("copied");
      if (copyText) copyText.textContent = "Copiar";
      if (icon) icon.textContent = "content_copy";
    }, 2000);
  }).catch(() => {});
}

// ══════════════════════════════════════════
// MARKDOWN RENDERER
// ══════════════════════════════════════════
function renderMarkdown(md) {
  if (typeof marked !== "undefined" && marked.parse) {
    try {
      return marked.parse(md, { gfm: true, breaks: true });
    } catch (e) {
      console.warn("marked.parse error, using fallback parser", e);
    }
  }
  return fallbackMarkdownParser(md);
}

function fallbackMarkdownParser(md) {
  if (!md) return "";

  let text = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  function escapeHtmlChars(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Code blocks
  const codeBlocks = [];
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `%%%FP_CODE_BLOCK_${codeBlocks.length}%%%`;
    const escapedCode = escapeHtmlChars(code.replace(/\n$/, ""));
    const langClass = lang ? ` class="language-${escapeHtmlChars(lang)}"` : "";
    codeBlocks.push(`<pre><code${langClass}>${escapedCode}</code></pre>`);
    return placeholder;
  });

  // Inline code
  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (match, code) => {
    const placeholder = `%%%FP_INLINE_CODE_${inlineCodes.length}%%%`;
    inlineCodes.push(`<code>${escapeHtmlChars(code)}</code>`);
    return placeholder;
  });

  // Headings
  text = text.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, content) => {
    const level = hashes.length;
    return `<h${level}>${content.trim()}</h${level}>`;
  });

  // Horizontal rules
  text = text.replace(/^(?:---|\*\*\*|___)\s*$/gm, "<hr>");

  // Blockquotes
  text = text.replace(/^(?:>\s?.+\n?)+/gm, (match) => {
    const lines = match.split("\n").map(l => l.replace(/^>\s?/, "")).join("<br>");
    return `<blockquote>${lines}</blockquote>`;
  });

  // Tables
  text = text.replace(/((?:\|.+?\|\r?\n)+)/g, (match) => {
    const rows = match.trim().split("\n");
    if (rows.length < 2) return match;
    let html = '<table>';
    let isHeader = true;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].trim();
      if (/^\|[\s\-:|]+\|$/.test(row)) {
        isHeader = false;
        continue;
      }
      const cells = row.split("|").slice(1, -1);
      if (isHeader) {
        html += "<thead><tr>" + cells.map(c => `<th>${c.trim()}</th>`).join("") + "</tr></thead><tbody>";
      } else {
        html += "<tr>" + cells.map(c => `<td>${c.trim()}</td>`).join("") + "</tr>";
      }
    }
    html += "</tbody></table>";
    return html;
  });

  // Task list checkboxes
  text = text.replace(/^\s*-\s+\[([ xX])\]\s+(.+)$/gm, (match, check, item) => {
    const checked = check.toLowerCase() === "x" ? 'checked="checked"' : '';
    return `<li class="task-list-item"><input type="checkbox" ${checked} disabled> ${item}</li>`;
  });

  // Unordered lists
  text = text.replace(/(?:^|\n)((?:[ \t]*[-*+]\s+.+\n?)+)/g, (match, list) => {
    const items = list.trim().split("\n").map(l => {
      if (l.includes('class="task-list-item"')) return l;
      return `<li>${l.replace(/^[ \t]*[-*+]\s+/, "")}</li>`;
    }).join("");
    return `\n<ul>${items}</ul>\n`;
  });

  // Ordered lists
  text = text.replace(/(?:^|\n)((?:[ \t]*\d+\.\s+.+\n?)+)/g, (match, list) => {
    const items = list.trim().split("\n").map(l => {
      return `<li>${l.replace(/^[ \t]*\d+\.\s+/, "")}</li>`;
    }).join("");
    return `\n<ol>${items}</ol>\n`;
  });

  // Images & Links
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Bold, Italic, Strikethrough
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Paragraphs
  const paragraphs = text.split(/\n{2,}/);
  text = paragraphs.map(p => {
    const trimmed = p.trim();
    if (!trimmed) return "";
    if (/^<(h[1-6]|ul|ol|pre|blockquote|table|hr|div)/i.test(trimmed)) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");

  // Restore Code blocks & Inline code
  text = text.replace(/%%%FP_CODE_BLOCK_(\d+)%%%/g, (m, idx) => codeBlocks[parseInt(idx)] || "");
  text = text.replace(/%%%FP_INLINE_CODE_(\d+)%%%/g, (m, idx) => inlineCodes[parseInt(idx)] || "");

  return text;
}

// ══════════════════════════════════════════
// TS TRANSMUXER (MPEG-TS → MP4 vía MSE + mux.js)
// ══════════════════════════════════════════
function playTsWithMSE(file, video) {
  return new Promise((resolve, reject) => {
    if (!window.muxjs) { reject(new Error("mux.js no disponible")); return; }

    const mediaSource = new MediaSource();
    const mseUrl = URL.createObjectURL(mediaSource);
    currentBlobUrl = mseUrl;
    video.src = mseUrl;

    mediaSource.addEventListener("sourceopen", () => {
      URL.revokeObjectURL(mseUrl);

      const transmuxer = new muxjs.mp4.Transmuxer({ keepOriginalTimestamps: true });
      const queue      = [];
      let appending    = false;
      let flushDone    = false;
      let sb;

      // Intentar con los codecs más comunes para H.264 + AAC
      const codecCandidates = [
        'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
        'video/mp4; codecs="avc1.64001f,mp4a.40.2"',
        'video/mp4; codecs="avc1.42E01E"',
        'video/mp4',
      ];

      for (const codec of codecCandidates) {
        try { sb = mediaSource.addSourceBuffer(codec); break; } catch (_) {}
      }

      if (!sb) { reject(new Error("No SourceBuffer compatible")); return; }

      function tryAppend() {
        if (appending || queue.length === 0) return;
        appending = true;
        try { sb.appendBuffer(queue.shift()); }
        catch (_) { appending = false; }
      }

      sb.addEventListener("updateend", () => {
        appending = false;
        if (queue.length > 0) { tryAppend(); return; }
        if (flushDone) {
          try { mediaSource.endOfStream(); } catch (_) {}
        }
      });

      transmuxer.on("data", (segment) => {
        const combined = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
        combined.set(segment.initSegment, 0);
        combined.set(segment.data, segment.initSegment.byteLength);
        queue.push(combined.buffer);
        tryAppend();
      });

      transmuxer.on("done", () => {
        flushDone = true;
        if (!appending && queue.length === 0) {
          try { mediaSource.endOfStream(); } catch (_) {}
        }
      });

      // Leer el archivo en chunks de 512 KB sin cargar todo en memoria
      (async () => {
        const CHUNK = 512 * 1024;
        let offset  = 0;
        try {
          while (offset < file.size) {
            const buf = await file.slice(offset, offset + CHUNK).arrayBuffer();
            transmuxer.push(new Uint8Array(buf));
            offset += CHUNK;
            await new Promise(r => setTimeout(r, 0)); // yield al UI
          }
          transmuxer.flush();
          resolve();
        } catch (e) { reject(e); }
      })();
    });

    mediaSource.addEventListener("sourceended",  () => {});
    mediaSource.addEventListener("sourceclosed",  () => {});
  });
}

// ══════════════════════════════════════════
// LOAD LESSON
// ══════════════════════════════════════════
let previewSeekVideo   = null;
let previewSeeking     = false;
let previewPendingTime = null;

function resetPreviewVideo() {
  if (previewSeekVideo) { previewSeekVideo.src = ""; previewSeekVideo = null; }
  clearTimeout(previewSeekWatchdog);
  previewSeeking     = false;
  previewPendingTime = null;
}

// ══════════════════════════════════════════
// MEDIA SESSION (botones avanzar/retroceder en PiP nativo del navegador y controles del SO)
// ══════════════════════════════════════════
function setupMediaSession(media, title) {
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: title || "FolderPlayer",
    artist: courseData.name || "FolderPlayer",
  });

  navigator.mediaSession.setActionHandler("seekbackward", (details) => {
    const skip = details.seekOffset || 10;
    media.currentTime = Math.max(0, media.currentTime - skip);
  });
  navigator.mediaSession.setActionHandler("seekforward", (details) => {
    const skip = details.seekOffset || 10;
    media.currentTime = Math.min(media.duration || media.currentTime, media.currentTime + skip);
  });
  navigator.mediaSession.setActionHandler("play",  () => media.play());
  navigator.mediaSession.setActionHandler("pause", () => media.pause());

  // Botones de "lección anterior/siguiente" en el PiP nativo del navegador
  navigator.mediaSession.setActionHandler(
    "previoustrack",
    currentLessonIndex > 0 ? () => prevLessonBtn.click() : null
  );
  navigator.mediaSession.setActionHandler(
    "nexttrack",
    currentLessonIndex < allLessons.length - 1 ? () => nextLessonBtn.click() : null
  );
}

function loadLesson(index, opts = {}) {
  if (index < 0 || index >= allLessons.length) return;
  const autoplay = opts.autoplay !== false;

  // Si el video activo está en Picture-in-Picture nativo y la nueva lección
  // también es un video, hay que REUTILIZAR el mismo <video> (solo cambiarle
  // la fuente) en vez de destruirlo: si se reconstruye desde cero, el
  // navegador cierra el PiP y no hay forma fiable de volver a pedirlo
  // (requiere activación del usuario, que ya se perdió para ese momento).
  const reuseVideoForNativePip =
    document.pictureInPictureElement === currentMedia &&
    !!currentMedia &&
    currentMedia.tagName === "VIDEO" &&
    allLessons[index].type === "video";

  currentLessonIndex = index;
  const lesson = allLessons[index];

  // Update header
  currentLessonEl.textContent = lesson.name;
  currentLessonEl.title       = lesson.name; // tooltip con el nombre completo si el encabezado lo recorta
  if (headerSep) headerSep.style.display = "inline";

  let reusedPipVideo = null;
  if (reuseVideoForNativePip) {
    reusedPipVideo = currentMedia;
    reusedPipVideo.pause();
    if (videoListenersAbort) videoListenersAbort.abort();
  } else {
    contentArea.innerHTML = "";
    if (currentMedia) {
      if (currentMedia.pause) currentMedia.pause();
      currentMedia = null;
    }
  }
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  resetPreviewVideo();
  isPlaying = false;
  updatePlayButton();

  const reader = new FileReader();

  if (lesson.type === "video") {
    const ext   = lesson.name.split(".").pop().toLowerCase();
    const video = reusedPipVideo || document.createElement("video");
    video.controls = false;

    videoListenersAbort = new AbortController();
    const { signal } = videoListenersAbort;

    // Archivos .ts requieren transmuxing a MP4 vía MSE
    if (ext === "ts" || ext === "mts" || ext === "m2ts") {
      playTsWithMSE(lesson.file, video).catch(() => {
        // Fallback: intentar reproducción directa si MSE falla
        if (currentMedia !== video) return;
        const fallbackUrl = URL.createObjectURL(lesson.file);
        currentBlobUrl    = fallbackUrl;
        video.src         = fallbackUrl;
      });
    } else {
      const objectUrl = URL.createObjectURL(lesson.file);
      currentBlobUrl  = objectUrl;
      video.src       = objectUrl;
    }

    video.addEventListener("loadedmetadata", () => {
      updateTimeDisplay();
      lesson.duration = formatTime(video.duration);
      renderSidebar();

      if (videoProgress[lesson.path]) {
        const saved = videoProgress[lesson.path].currentTime;
        if (saved > 0 && saved < video.duration - 5) video.currentTime = saved;
      }
    }, { signal });

    // Mostrar error solo si este video sigue siendo el activo
    video.addEventListener("error", () => {
      if (currentMedia !== video) return;
      contentArea.innerHTML = `
        <div class="placeholder">
          <div class="placeholder-icon"><span class="material-icons-round">videocam_off</span></div>
          <h3>Formato no compatible</h3>
          <p>El navegador no puede reproducir este archivo.<br>Intenta con MP4 (H.264) o WebM.</p>
        </div>`;
    }, { signal });

    let lastProgressUpdate = 0;

    video.addEventListener("timeupdate", () => {
      updateProgress();
      updateBuffer();
      const now = Date.now();
      if (now - lastProgressUpdate > 500) {
        updateVideoProgress(lesson.path, video.currentTime, video.duration);
        lastProgressUpdate = now;
      }
    }, { signal });

    video.addEventListener("ended", onMediaEnded, { signal });

    video.addEventListener("click", () => {
      if (video.paused) { video.play(); isPlaying = true; }
      else              { video.pause(); isPlaying = false; }
      updatePlayButton();
    }, { signal });

    if (!reusedPipVideo) contentArea.appendChild(video);
    currentMedia = video;

    // Restore speed
    const savedSpeed = localStorage.getItem("playbackSpeed");
    video.playbackRate = savedSpeed ? parseFloat(savedSpeed) : 1;
    speedBtn.textContent = video.playbackRate + "x";
    updateSpeedUI(video.playbackRate);

    // Restore volume
    const savedVolume = localStorage.getItem("videoVolume");
    if (savedVolume !== null) {
      video.volume  = parseFloat(savedVolume);
      currentVolume = video.volume * 100;
      if (volumeSlider) volumeSlider.value = currentVolume;
    } else {
      video.volume = currentVolume / 100;
      if (volumeSlider) volumeSlider.value = currentVolume;
    }
    updateVolumeIcon();

    video.addEventListener("volumechange", () => {
      localStorage.setItem("videoVolume", video.volume);
    }, { signal });

    setupMediaSession(video, lesson.name);

    if (autoplay) video.play().then(() => { isPlaying = true; updatePlayButton(); }).catch(() => {});
    else updatePlayButton(); // se retoma pausado, esperando a que el usuario le dé play

  } else if (lesson.type === "audio") {
    const audio = document.createElement("audio");
    audio.style.display = "none";

    const objectUrl = URL.createObjectURL(lesson.file);
    currentBlobUrl  = objectUrl;
    audio.src       = objectUrl;

    const audioView = document.createElement("div");
    audioView.className = "audio-view placeholder";
    audioView.innerHTML = `
      <div class="placeholder-icon"><span class="material-icons-round">headphones</span></div>
      <h3>${escapeHtml(lesson.name)}</h3>
      <div class="audio-eq"><span></span><span></span><span></span><span></span><span></span></div>
    `;

    audio.addEventListener("loadedmetadata", () => {
      updateTimeDisplay();
      lesson.duration = formatTime(audio.duration);
      renderSidebar();

      if (videoProgress[lesson.path]) {
        const saved = videoProgress[lesson.path].currentTime;
        if (saved > 0 && saved < audio.duration - 5) audio.currentTime = saved;
      }
    });

    audio.addEventListener("error", () => {
      if (currentMedia !== audio) return;
      contentArea.innerHTML = `
        <div class="placeholder">
          <div class="placeholder-icon"><span class="material-icons-round">music_off</span></div>
          <h3>Formato no compatible</h3>
          <p>El navegador no puede reproducir este archivo de audio.</p>
        </div>`;
    });

    let lastAudioProgressUpdate = 0;

    audio.addEventListener("timeupdate", () => {
      updateProgress();
      updateBuffer();
      const now = Date.now();
      if (now - lastAudioProgressUpdate > 500) {
        updateVideoProgress(lesson.path, audio.currentTime, audio.duration);
        lastAudioProgressUpdate = now;
      }
    });

    audio.addEventListener("ended", onMediaEnded);

    audio.addEventListener("play",  () => audioView.classList.add("playing"));
    audio.addEventListener("pause", () => audioView.classList.remove("playing"));

    audioView.addEventListener("click", () => {
      if (audio.paused) { audio.play(); isPlaying = true; }
      else              { audio.pause(); isPlaying = false; }
      updatePlayButton();
    });

    contentArea.appendChild(audioView);
    contentArea.appendChild(audio);
    currentMedia = audio;

    // Restore speed
    const savedSpeedAudio = localStorage.getItem("playbackSpeed");
    audio.playbackRate = savedSpeedAudio ? parseFloat(savedSpeedAudio) : 1;
    speedBtn.textContent = audio.playbackRate + "x";
    updateSpeedUI(audio.playbackRate);

    // Restore volume
    const savedVolumeAudio = localStorage.getItem("videoVolume");
    if (savedVolumeAudio !== null) {
      audio.volume  = parseFloat(savedVolumeAudio);
      currentVolume = audio.volume * 100;
      if (volumeSlider) volumeSlider.value = currentVolume;
    } else {
      audio.volume = currentVolume / 100;
      if (volumeSlider) volumeSlider.value = currentVolume;
    }
    updateVolumeIcon();

    audio.addEventListener("volumechange", () => {
      localStorage.setItem("videoVolume", audio.volume);
    });

    setupMediaSession(audio, lesson.name);

    if (autoplay) audio.play().then(() => { isPlaying = true; updatePlayButton(); }).catch(() => {});
    else updatePlayButton(); // se retoma pausado, esperando a que el usuario le dé play

  } else if (lesson.type === "image") {
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.src = e.target.result;
      contentArea.appendChild(img);
    };
    reader.readAsDataURL(lesson.file);

  } else if (lesson.type === "code") {
    reader.onload = (e) => {
      const codeText     = e.target.result;
      const extension    = lesson.name.split(".").pop().toLowerCase();
      const languageName = getLanguageName(extension);
      const isHtml       = ["html", "htm"].includes(extension);
      const isMarkdown   = ["md", "markdown"].includes(extension);

      const container = document.createElement("div");
      container.className  = "code-display";
      container.dataset.code = codeText;

      const header = document.createElement("div");
      header.className = "code-header";
      header.innerHTML = `
        <div class="viewer-tabs">
          <button class="viewer-tab-btn active" data-tab="preview" title="Vista previa">
            <span class="material-icons-round">visibility</span>
            <span>Vista previa</span>
          </button>
          <button class="viewer-tab-btn" data-tab="code" title="Ver código fuente">
            <span class="material-icons-round">code</span>
            <span>Ver código</span>
          </button>
        </div>
        <div class="viewer-header-right">
          <div class="code-language">${languageName}</div>
          ${isHtml ? `
            <button class="viewer-open-btn" id="openHtmlNewTab" title="Abrir en pestaña nueva">
              <span class="material-icons-round">open_in_new</span>
              <span>Abrir pestaña</span>
            </button>
          ` : ""}
          <button class="code-copy-btn" onclick="copyCodeToClipboard(this)">
            <span class="material-icons-round">content_copy</span>
            <span class="copy-text">Copiar</span>
          </button>
        </div>`;

      const paneContainer = document.createElement("div");
      paneContainer.className = "viewer-pane-container";

      const codePane = document.createElement("div");
      codePane.className = "viewer-code-pane";
      const codeContent = document.createElement("div");
      codeContent.className   = "code-content";
      codeContent.textContent = codeText;
      codePane.appendChild(codeContent);

      const previewPane = document.createElement("div");
      previewPane.className = "viewer-preview-pane";

      if (isHtml) {
        const iframe = document.createElement("iframe");
        iframe.className = "html-preview-frame";
        iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-modals allow-popups");
        iframe.srcdoc = codeText;
        previewPane.appendChild(iframe);

        const openBtn = header.querySelector("#openHtmlNewTab");
        if (openBtn) {
          openBtn.addEventListener("click", () => {
            const blob = new Blob([codeText], { type: "text/html" });
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, "_blank");
          });
        }
      } else if (isMarkdown) {
        const mdContent = document.createElement("div");
        mdContent.className = "markdown-preview";
        mdContent.innerHTML = renderMarkdown(codeText);
        mdContent.querySelectorAll("a").forEach((a) => {
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
        });
        previewPane.appendChild(mdContent);
      } else {
        // Resto de tipos de código: la "vista previa" es el código con resaltado de sintaxis
        const highlightPre = document.createElement("pre");
        highlightPre.className = "code-highlight-pane";
        const highlightCode = document.createElement("code");
        highlightCode.className   = `language-${extension}`;
        highlightCode.textContent = codeText;
        highlightPre.appendChild(highlightCode);
        previewPane.appendChild(highlightPre);
        if (window.hljs) {
          try { hljs.highlightElement(highlightCode); } catch (_) {}
        }
      }

      // Default state: Preview visible, Code hidden
      codePane.style.display = "none";
      previewPane.style.display = "flex";

      paneContainer.appendChild(previewPane);
      paneContainer.appendChild(codePane);

      // Tab click events
      const tabBtns = header.querySelectorAll(".viewer-tab-btn");
      tabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          tabBtns.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          const tab = btn.dataset.tab;
          if (tab === "preview") {
            previewPane.style.display = "flex";
            codePane.style.display = "none";
          } else {
            previewPane.style.display = "none";
            codePane.style.display = "block";
          }
        });
      });

      container.appendChild(header);
      container.appendChild(paneContainer);
      contentArea.appendChild(container);
    };
    reader.readAsText(lesson.file);

  } else if (lesson.type === "pdf") {
    reader.onload = (e) => {
      const iframe = document.createElement("iframe");
      iframe.src = e.target.result;
      iframe.style.width = "100%"; iframe.style.height = "100%"; iframe.style.border = "none";
      contentArea.appendChild(iframe);
    };
    reader.readAsDataURL(lesson.file);

  } else {
    contentArea.innerHTML = `<div class="placeholder"><h3>Formato no soportado</h3></div>`;
  }

  renderSidebar();
  updateNavigationButtons();
  updateCompleteBtn();
}

// ══════════════════════════════════════════
// PLAY / PAUSE
// ══════════════════════════════════════════
function updatePlayButton() {
  const icon = playPauseBtn.querySelector(".material-icons-round");
  if (!icon) return;
  icon.textContent = isPlaying ? "pause" : "play_arrow";
  pauseOverlay.classList.toggle("visible", !isPlaying && currentMedia !== null);
}

function updateCompleteBtn() {
  if (currentLessonIndex < 0) return;
  const isDone    = completedLessons.has(currentLessonIndex);
  const isLast    = currentLessonIndex >= allLessons.length - 1;
  const icon      = completeBtn.querySelector(".material-icons-round");
  const label     = completeBtn.querySelector(".complete-btn-label");

  completeBtn.classList.toggle("done", isDone);
  icon.textContent  = isDone ? "check_circle" : "check_circle_outline";
  label.textContent = isLast ? "Marcar completado" : "Completar y continuar";
  completeBtn.title = isLast
    ? "Marcar esta lección como completada"
    : "Marcar como completada y pasar a la siguiente";
}

rewatchBtn.addEventListener("click", () => {
  if (currentLessonIndex < 0) return;
  const lesson = allLessons[currentLessonIndex];

  // Quitar de completados
  completedLessons.delete(currentLessonIndex);

  // Limpiar progreso guardado del video
  if (videoProgress[lesson.path]) {
    delete videoProgress[lesson.path];
    saveProgress();
  }

  // Reiniciar video/audio al inicio
  if (currentMedia && (currentMedia.tagName === "VIDEO" || currentMedia.tagName === "AUDIO")) {
    currentMedia.currentTime = 0;
    progressFilled.style.width = "0%";
    if (progressBuffer) progressBuffer.style.width = "0%";
    updateTimeDisplay();
    currentMedia.play().then(() => { isPlaying = true; updatePlayButton(); }).catch(() => {});
  }

  renderSidebar();
  updateGlobalProgress();
  updateCompleteBtn();
});

completeBtn.addEventListener("click", () => {
  if (currentLessonIndex < 0) return;

  // Marcar como completado
  completedLessons.add(currentLessonIndex);
  renderSidebar();
  updateGlobalProgress();
  updateCompleteBtn();

  // Si hay lección siguiente, avanzar
  if (currentLessonIndex < allLessons.length - 1) {
    loadLesson(currentLessonIndex + 1);
  }
});

playPauseBtn.addEventListener("click", () => {
  if (!currentMedia) return;
  if (isPlaying) {
    currentMedia.pause();
    isPlaying = false;
    clearTimeout(controlsTimeout);   // cancelar el auto-hide al pausar
    showControls();                  // asegurar que se vean los controles
  } else {
    currentMedia.play();
    isPlaying = true;
    showControls();                  // reinicia el timer de auto-hide
  }
  updatePlayButton();
});

// ══════════════════════════════════════════
// SPEED
// ══════════════════════════════════════════
function updateSpeedUI(speed) {
  document.querySelectorAll("[data-speed]").forEach((el) => {
    el.classList.toggle("active", parseFloat(el.dataset.speed) === speed);
  });
  const label = speed === 1 ? "Normal" : speed + "x";
  speedBtn.textContent = speed + "x";
}

speedBtn.addEventListener("click", () => {
  if (!currentMedia) return;
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const idx    = speeds.indexOf(playbackSpeed);
  playbackSpeed = speeds[(idx + 1) % speeds.length];
  currentMedia.playbackRate = playbackSpeed;
  localStorage.setItem("playbackSpeed", playbackSpeed);
  updateSpeedUI(playbackSpeed);
});

document.querySelectorAll("[data-speed]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    const speed = parseFloat(item.dataset.speed);
    playbackSpeed = speed;
    if (currentMedia) currentMedia.playbackRate = speed;
    localStorage.setItem("playbackSpeed", speed);
    updateSpeedUI(speed);
  });
});

// ══════════════════════════════════════════
// REWIND / FORWARD
// ══════════════════════════════════════════
rewindBtn.addEventListener("click", () => {
  if (!currentMedia) return;
  currentMedia.currentTime = Math.max(0, currentMedia.currentTime - 10);
});

forwardBtn.addEventListener("click", () => {
  if (!currentMedia) return;
  currentMedia.currentTime = Math.min(currentMedia.duration, currentMedia.currentTime + 10);
});

// ══════════════════════════════════════════
// FULLSCREEN
// ══════════════════════════════════════════
function toggleFullscreen() {
  const icon = fullscreenBtn.querySelector(".material-icons-round");
  if (!document.fullscreenElement) {
    const el = videoSection;
    if (el.requestFullscreen)            el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    if (icon) icon.textContent = "fullscreen_exit";
  } else {
    if (document.exitFullscreen)            document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    if (icon) icon.textContent = "fullscreen";
  }
}

fullscreenBtn.addEventListener("click", toggleFullscreen);

document.addEventListener("fullscreenchange", () => {
  const icon = fullscreenBtn.querySelector(".material-icons-round");
  const videoArea = document.getElementById("videoArea");
  if (document.fullscreenElement) {
    if (icon) icon.textContent = "fullscreen_exit";
    videoArea.classList.add("fs-active");
    showControls(); // muestra y arranca el timer
  } else {
    if (icon) icon.textContent = "fullscreen";
    videoArea.classList.remove("fs-active", "cursor-visible");
    clearTimeout(controlsTimeout);
    controlsOverlay.classList.add("visible"); // siempre visible fuera de fs
  }
});

// El dblclick en la barra de controles NO debe activar fullscreen
controlsOverlay.addEventListener("dblclick", (e) => e.stopPropagation());

videoSection.addEventListener("dblclick", () => toggleFullscreen());

// ══════════════════════════════════════════
// PICTURE IN PICTURE (native)
// ══════════════════════════════════════════
pipBtn.addEventListener("click", async () => {
  if (!currentMedia || currentMedia.tagName !== "VIDEO") return;
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else                                  await currentMedia.requestPictureInPicture();
  } catch (_) {}
});

// ══════════════════════════════════════════
// CUSTOM PiP WINDOW
// ══════════════════════════════════════════
customPipBtn.addEventListener("click", () => {
  if (!currentMedia || currentMedia.tagName !== "VIDEO") return;
  if (isPipActive) closePip(); else openPip();
});

function openPip() {
  if (!currentMedia || isPipActive) return;
  isPipActive = true;
  const currentTime = currentMedia.currentTime;
  const wasPlaying  = !currentMedia.paused;

  pipVideo = currentMedia.cloneNode(true);
  pipVideo.src         = currentMedia.src;
  pipVideo.currentTime = currentTime;
  pipVideo.volume      = currentMedia.volume;
  pipVideo.playbackRate = currentMedia.playbackRate;
  pipVideo.controls    = true;

  currentMedia.pause();

  pipVideoContainer.innerHTML = "";
  pipVideoContainer.appendChild(pipVideo);

  const lesson = allLessons[currentLessonIndex];
  pipTitle.textContent = lesson ? lesson.name : "Video";

  pipOverlay.classList.add("visible");

  if (wasPlaying) pipVideo.play();

  pipVideo.addEventListener("timeupdate", () => {
    if (currentMedia && lesson) {
      currentMedia.currentTime = pipVideo.currentTime;
      updateVideoProgress(lesson.path, pipVideo.currentTime, pipVideo.duration);
    }
  });

  const icon = customPipBtn.querySelector(".material-icons-round");
  if (icon) icon.textContent = "close_fullscreen";
}

function closePip() {
  if (!isPipActive) return;
  const currentTime = pipVideo ? pipVideo.currentTime : 0;
  const wasPlaying  = pipVideo ? !pipVideo.paused : false;

  if (currentMedia) {
    currentMedia.currentTime = currentTime;
    if (wasPlaying) { currentMedia.play(); isPlaying = true; updatePlayButton(); }
  }

  pipVideoContainer.innerHTML = "";
  pipVideo    = null;
  isPipActive = false;
  pipOverlay.classList.remove("visible");

  const icon = customPipBtn.querySelector(".material-icons-round");
  if (icon) icon.textContent = "open_in_new";
}

pipClose.addEventListener("click", closePip);

pipMinimize.addEventListener("click", () => {
  const isSmall = pipOverlay.style.width === "240px";
  pipOverlay.style.width = isSmall ? "320px" : "240px";
});

pipRewind.addEventListener("click", () => {
  if (!pipVideo) return;
  pipVideo.currentTime = Math.max(0, pipVideo.currentTime - 10);
});

pipForward.addEventListener("click", () => {
  if (!pipVideo || !pipVideo.duration) return;
  pipVideo.currentTime = Math.min(pipVideo.duration, pipVideo.currentTime + 10);
});

// Navegar de lección sin salir de la ventana flotante: se cierra, se carga
// la lección, y se vuelve a abrir sobre el nuevo video una vez que sus
// metadatos (y la posición guardada) ya se aplicaron. Si la lección
// siguiente/anterior no es un video, la ventana flotante se queda cerrada.
function reopenPipWhenReady() {
  if (currentMedia) {
    currentMedia.addEventListener("loadedmetadata", () => {
      if (currentMedia && currentMedia.tagName === "VIDEO") openPip();
    }, { once: true });
  }
}

pipPrev.addEventListener("click", () => {
  if (currentLessonIndex <= 0) return;
  completedLessons.add(currentLessonIndex);
  closePip();
  loadLesson(currentLessonIndex - 1);
  reopenPipWhenReady();
});

pipNext.addEventListener("click", () => {
  if (currentLessonIndex >= allLessons.length - 1) return;
  closePip();
  loadLesson(currentLessonIndex + 1);
  reopenPipWhenReady();
});

// PiP drag
let isDragging = false, currentX, currentY, initialX, initialY;

pipHeader.addEventListener("mousedown", (e) => {
  if (e.target.closest(".pip-btn")) return;
  isDragging = true;
  initialX   = e.clientX - pipOverlay.offsetLeft;
  initialY   = e.clientY - pipOverlay.offsetTop;
  pipHeader.style.cursor = "grabbing";
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  e.preventDefault();
  currentX = Math.max(0, Math.min(e.clientX - initialX, window.innerWidth  - pipOverlay.offsetWidth));
  currentY = Math.max(0, Math.min(e.clientY - initialY, window.innerHeight - pipOverlay.offsetHeight));
  pipOverlay.style.left   = currentX + "px";
  pipOverlay.style.top    = currentY + "px";
  pipOverlay.style.right  = "auto";
  pipOverlay.style.bottom = "auto";
});

document.addEventListener("mouseup", () => {
  if (isDragging) { isDragging = false; pipHeader.style.cursor = "move"; }
});

// ══════════════════════════════════════════
// PROGRESS BAR
// ══════════════════════════════════════════
let isDraggingProgress = false;

progressBarContainer.addEventListener("mousedown", (e) => {
  if (!currentMedia || !currentMedia.duration) return;
  isDraggingProgress = true;
  seekFromMouse(e);
});

document.addEventListener("mousemove", (e) => {
  if (!isDraggingProgress) return;
  seekFromMouse(e);
});

document.addEventListener("mouseup", () => { isDraggingProgress = false; });

function seekFromMouse(e) {
  if (!currentMedia || !currentMedia.duration) return;
  const rect       = progressBarContainer.getBoundingClientRect();
  const x          = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const percentage = x / rect.width;
  currentMedia.currentTime = percentage * currentMedia.duration;
  progressFilled.style.width = percentage * 100 + "%";
  updateTimeDisplay();
}

function updateProgress() {
  if (!currentMedia || !currentMedia.duration) return;
  const pct = (currentMedia.currentTime / currentMedia.duration) * 100;
  progressFilled.style.width = pct + "%";
  updateTimeDisplay();
}

function updateBuffer() {
  if (!currentMedia || !currentMedia.buffered || !currentMedia.duration) return;
  if (currentMedia.buffered.length === 0) return;
  const bufferedEnd = currentMedia.buffered.end(currentMedia.buffered.length - 1);
  const pct = (bufferedEnd / currentMedia.duration) * 100;
  if (progressBuffer) progressBuffer.style.width = pct + "%";
}

function updateTimeDisplay() {
  if (!currentMedia || !currentMedia.duration) {
    timeDisplay.textContent = "0:00 / 0:00";
    return;
  }
  timeDisplay.textContent = `${formatTime(currentMedia.currentTime)} / ${formatTime(currentMedia.duration)}`;
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ══════════════════════════════════════════
// END-OF-VIDEO CHIME
// ══════════════════════════════════════════
let chimeAudioCtx = null;

function playEndChime() {
  if (isMuted || currentVolume === 0) return;
  try {
    if (!chimeAudioCtx) chimeAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (chimeAudioCtx.state === "suspended") chimeAudioCtx.resume();

    const ctx = chimeAudioCtx;
    const now = ctx.currentTime;
    // Dos notas ascendentes cortas, distintas al sonido tipo Platzi
    const notes = [
      { freq: 784,    start: 0,    dur: 0.16 }, // G5
      { freq: 1174.7, start: 0.11, dur: 0.32 }, // D6
    ];

    notes.forEach(({ freq, start, dur }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const t0 = now + start;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.55, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    });
  } catch (_) {}
}

// ══════════════════════════════════════════
// ON MEDIA ENDED
// ══════════════════════════════════════════
function onMediaEnded() {
  const lesson = allLessons[currentLessonIndex];
  if (lesson && lesson.type === "video") playEndChime();

  completedLessons.add(currentLessonIndex);
  renderSidebar();
  updateGlobalProgress();

  if (autoplay && currentLessonIndex < allLessons.length - 1) {
    setTimeout(() => {
      loadLesson(currentLessonIndex + 1);
      if (currentMedia && currentMedia.play) {
        currentMedia.play();
        isPlaying = true;
        updatePlayButton();
      }
    }, 1000);
  }
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
prevLessonBtn.addEventListener("click", () => {
  if (currentLessonIndex > 0) {
    completedLessons.add(currentLessonIndex);
    loadLesson(currentLessonIndex - 1);
  }
});

nextLessonBtn.addEventListener("click", () => {
  if (currentLessonIndex < allLessons.length - 1) {
    loadLesson(currentLessonIndex + 1);
  }
});

function updateNavigationButtons() {
  prevLessonBtn.disabled = currentLessonIndex <= 0;
  nextLessonBtn.disabled = currentLessonIndex >= allLessons.length - 1;
}

// ══════════════════════════════════════════
// SETTINGS POPUP
// ══════════════════════════════════════════
settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsMenu.classList.toggle("open");
  themeSubmenu.style.display = "none";
});

document.addEventListener("click", (e) => {
  if (!settingsMenu.contains(e.target) && e.target !== settingsBtn) {
    settingsMenu.classList.remove("open");
  }
});

// Autoplay — sincroniza botón de barra + toggle del settings
function setAutoplay(value) {
  autoplay = value;
  localStorage.setItem("autoplay", autoplay);
  toggleSwitch.classList.toggle("on", autoplay);
  autoplayBtn.classList.toggle("on", autoplay);
  autoplayBtn.title = autoplay ? "Autoplay activado" : "Autoplay desactivado";
}

setAutoplay(autoplay); // aplicar estado inicial

autoplayBtn.addEventListener("click", () => setAutoplay(!autoplay));

autoplayMenuItem.addEventListener("click", () => setAutoplay(!autoplay));

// Theme
themeMenuItem.addEventListener("click", () => {
  themeSubmenu.style.display = themeSubmenu.style.display === "grid" ? "none" : "grid";
});

document.querySelectorAll("[data-theme]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    const selectedTheme = item.dataset.theme;
    theme = selectedTheme;
    localStorage.setItem("theme", selectedTheme);
    document.querySelectorAll("[data-theme]").forEach((el) => el.classList.remove("active"));
    item.classList.add("active");
    document.getElementById("currentTheme").textContent = item.textContent.trim();
    applyTheme(selectedTheme);
    themeSubmenu.style.display = "none";
  });
});

function updateHljsTheme() {
  const isLight = document.body.classList.contains("light-mode");
  const darkEl  = document.getElementById("hljsThemeDark");
  const lightEl = document.getElementById("hljsThemeLight");
  if (darkEl)  darkEl.disabled  = isLight;
  if (lightEl) lightEl.disabled = !isLight;
}

function applyTheme(selectedTheme) {
  if (selectedTheme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.classList.toggle("light-mode", !prefersDark);
  } else if (selectedTheme === "light") {
    document.body.classList.add("light-mode");
  } else {
    document.body.classList.remove("light-mode");
  }
  updateHljsTheme();
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (theme === "system") {
    document.body.classList.toggle("light-mode", !e.matches);
    updateHljsTheme();
  }
});

// Load saved theme
const savedTheme = localStorage.getItem("theme") || "system";
theme = savedTheme;
applyTheme(theme);
document.querySelectorAll("[data-theme]").forEach((el) => {
  el.classList.toggle("active", el.dataset.theme === theme);
});
const activeThemeEl = document.querySelector(`[data-theme="${theme}"]`);
if (activeThemeEl) document.getElementById("currentTheme").textContent = activeThemeEl.textContent.trim();

// Load saved speed UI
updateSpeedUI(playbackSpeed);

// ══════════════════════════════════════════
// VOLUME
// ══════════════════════════════════════════
function updateVolumeIcon() {
  const icon = document.getElementById("volumeIcon");
  if (!icon) return;
  if (currentVolume === 0 || isMuted) icon.textContent = "volume_off";
  else if (currentVolume < 50)        icon.textContent = "volume_down";
  else                                icon.textContent = "volume_up";
}

volumeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMute();
});

volumeSlider.addEventListener("input", (e) => {
  const volume = parseInt(e.target.value);
  setVolume(volume);
});

function setVolume(volume) {
  currentVolume = volume;
  if (volumePercentage) volumePercentage.textContent = volume + "%";
  if (currentMedia) currentMedia.volume = volume / 100;
  isMuted = volume === 0;
  updateVolumeIcon();
  if (volume > 0) lastVolume = volume;
}

function changeVolume(delta) {
  const newVolume = Math.max(0, Math.min(100, currentVolume + delta));
  volumeSlider.value = newVolume;
  setVolume(newVolume);
}

function toggleMute() {
  if (isMuted || currentVolume === 0) {
    const restore = lastVolume || 100;
    volumeSlider.value = restore;
    setVolume(restore);
  } else {
    lastVolume = currentVolume;
    volumeSlider.value = 0;
    setVolume(0);
  }
}

// ══════════════════════════════════════════
// CONTROLS VISIBILITY (fullscreen auto-hide)
// ══════════════════════════════════════════
videoSection.addEventListener("mousemove", showControls);
videoSection.addEventListener("mouseleave", () => {
  if (document.fullscreenElement) hideControls();
});

function showControls() {
  const videoArea = document.getElementById("videoArea");
  controlsOverlay.classList.add("visible");
  if (videoArea) videoArea.classList.add("cursor-visible");
  clearTimeout(controlsTimeout);
  // Auto-ocultar si el video está reproduciéndose (fullscreen o no)
  if (isPlaying && currentMedia) {
    controlsTimeout = setTimeout(hideControls, 1000);
  }
}

function hideControls() {
  const videoArea = document.getElementById("videoArea");
  controlsOverlay.classList.remove("visible");
  if (videoArea) videoArea.classList.remove("cursor-visible");
}

// ══════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════════
document.addEventListener("keydown", (e) => {
  // Don't fire if typing in an input
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if (e.key === " " && currentMedia) {
    e.preventDefault();
    playPauseBtn.click();
  } else if (e.key === "ArrowLeft" && currentMedia) {
    rewindBtn.click();
  } else if (e.key === "ArrowRight" && currentMedia) {
    forwardBtn.click();
  } else if (e.key === "ArrowUp" && currentMedia) {
    e.preventDefault();
    changeVolume(5);
  } else if (e.key === "ArrowDown" && currentMedia) {
    e.preventDefault();
    changeVolume(-5);
  } else if (e.key.toLowerCase() === "m" && currentMedia) {
    toggleMute();
  } else if (e.key === "f" || e.key === "F") {
    toggleFullscreen();
  }
});

// ══════════════════════════════════════════
// PROGRESS PREVIEW (thumbnail)
// ══════════════════════════════════════════
const progressPreview = document.getElementById("progressPreview");
const previewCanvas   = document.getElementById("previewCanvas");
const previewTime     = document.getElementById("previewTime");
const previewCtx      = previewCanvas
  ? previewCanvas.getContext("2d", { alpha: false, desynchronized: true }) : null;

// Resolución reducida y sin escalado retina: la miniatura es pequeña y
// decodificar/pintar en alta resolución en cada mousemove causaba lag al buscar.
const PREVIEW_W = 128;
const PREVIEW_H = 72;

if (previewCanvas && previewCtx) {
  previewCanvas.width  = PREVIEW_W;
  previewCanvas.height = PREVIEW_H;
  previewCanvas.style.width  = PREVIEW_W + "px";
  previewCanvas.style.height = PREVIEW_H + "px";
  previewCtx.imageSmoothingEnabled  = true;
  previewCtx.imageSmoothingQuality  = "low";
}

// Throttle + coalescing: como máximo un seek "en vuelo" a la vez, y como mucho
// uno cada PREVIEW_SEEK_INTERVAL ms, para no saturar el decodificador de video.
const PREVIEW_SEEK_INTERVAL = 120;
let lastPreviewSeekTime = 0;

let previewSeekWatchdog = null;

function requestPreviewFrame(time) {
  // Ya está (casi) en esa posición: nada que buscar, evita un currentTime
  // redundante que algunos navegadores no confirman con un evento "seeked".
  if (Math.abs(previewSeekVideo.currentTime - time) < 0.05) {
    previewPendingTime = null;
    return;
  }

  const now = Date.now();
  if (previewSeeking || now - lastPreviewSeekTime < PREVIEW_SEEK_INTERVAL) {
    previewPendingTime = time;
    return;
  }
  previewPendingTime = null;
  previewSeeking     = true;
  lastPreviewSeekTime = now;
  clearTimeout(previewSeekWatchdog);
  // Red de seguridad: si "seeked" nunca llega, no dejar la miniatura congelada.
  previewSeekWatchdog = setTimeout(() => { previewSeeking = false; }, 500);
  try { previewSeekVideo.currentTime = time; }
  catch (_) { previewSeeking = false; }
}

progressBarContainer.addEventListener("mousemove", (e) => {
  if (!currentMedia || !currentMedia.duration || currentMedia.tagName !== "VIDEO") {
    progressPreview.style.display = "none";
    return;
  }

  const rect       = progressBarContainer.getBoundingClientRect();
  const x          = e.clientX - rect.left;
  const percentage = Math.max(0, Math.min(1, x / rect.width));
  const time       = percentage * currentMedia.duration;

  const leftPos = Math.max(PREVIEW_W / 2, Math.min(x, rect.width - PREVIEW_W / 2));

  progressPreview.style.left    = leftPos + "px";
  progressPreview.style.display = "block";
  previewTime.textContent       = formatTime(time);

  if (previewCtx && currentMedia.readyState >= 2) {
    try {
      if (!previewSeekVideo) {
        previewSeekVideo = document.createElement("video");
        previewSeekVideo.muted   = true;
        previewSeekVideo.preload = "auto";
        previewSeekVideo.src     = currentMedia.src;
        previewSeekVideo.addEventListener("seeked", () => {
          clearTimeout(previewSeekWatchdog);
          previewSeeking = false;
          try { previewCtx.drawImage(previewSeekVideo, 0, 0, PREVIEW_W, PREVIEW_H); } catch (_) {}
          if (previewPendingTime !== null) requestPreviewFrame(previewPendingTime);
        });
      }
      requestPreviewFrame(time);
    } catch (_) {}
  }
});

progressBarContainer.addEventListener("mouseleave", () => {
  progressPreview.style.display = "none";
  previewPendingTime = null;
});
