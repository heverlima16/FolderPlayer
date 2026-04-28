// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let courseData          = { name: "", modules: [] };
let currentLessonIndex  = -1;
let allLessons          = [];
let isPlaying           = false;
let currentMedia        = null;
let playbackSpeed       = localStorage.getItem("playbackSpeed")
                          ? parseFloat(localStorage.getItem("playbackSpeed")) : 1;
let autoplay            = localStorage.getItem("autoplay") === "true";
let completedLessons    = new Set();
let theme               = "system";
let expandedModules     = new Set();
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

// ══════════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════════
const folderInput          = document.getElementById("folderInput");
const loadFolderBtn        = document.getElementById("loadFolder");
const toggleSidebarBtn     = document.getElementById("toggleSidebar");
const sidebar              = document.getElementById("sidebar");
const contentArea          = document.getElementById("contentArea");
const sidebarContent       = document.getElementById("sidebarContent");
const courseName           = document.getElementById("courseName");
const currentLessonEl      = document.getElementById("currentLesson");
const headerSep            = document.getElementById("headerSep");
const playPauseBtn         = document.getElementById("playPauseBtn");
const speedBtn             = document.getElementById("speedBtn");
const timeDisplay          = document.getElementById("timeDisplay");
const progressBar          = document.getElementById("progressBar");
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
// FOLDER LOADING
// ══════════════════════════════════════════
loadFolderBtn.addEventListener("click", () => folderInput.click());

folderInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  await processFolder(files);
});

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
  if (VIDEO_EXTS.includes(ext))                                 return "video";
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext))    return "image";
  if (["js","html","css","json","py","java","cpp","sql","c","txt","md"].includes(ext)) return "code";
  if (ext === "pdf")                                             return "pdf";
  return "unknown";
}

function getTypeIcon(type) {
  const map = { video:"play_circle", image:"image", code:"code", pdf:"description", unknown:"attach_file" };
  return map[type] || "attach_file";
}

function getLanguageName(ext) {
  const languages = {
    js:"JavaScript", py:"Python", java:"Java", cpp:"C++", c:"C", cs:"C#",
    html:"HTML", css:"CSS", sql:"SQL", json:"JSON", xml:"XML", php:"PHP",
    rb:"Ruby", go:"Go", rs:"Rust", ts:"TypeScript", jsx:"React JSX", tsx:"React TSX",
    md:"Markdown", txt:"Text", sh:"Shell", bash:"Bash", yml:"YAML", yaml:"YAML",
  };
  return languages[ext] || ext.toUpperCase();
}

// ══════════════════════════════════════════
// PROCESS FOLDER
// ══════════════════════════════════════════
async function processFolder(files) {
  const structure  = {};
  const rootPath   = files[0].webkitRelativePath.split("/")[0];
  const validExts  = [...VIDEO_EXTS, "pdf","js","html","css","py","java","cpp","c","txt","md","jpg","jpeg","png","gif","webp","svg"];
  const excluded   = [".DS_Store","Thumbs.db",".gitignore"];

  files.forEach((file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!validExts.includes(ext) || excluded.includes(file.name)) return;
    const parts = file.webkitRelativePath.split("/");
    parts.shift();
    if (parts.length === 1) {
      if (!structure["_root"]) structure["_root"] = [];
      structure["_root"].push(file);
    } else {
      const folder = parts[0];
      if (!structure[folder]) structure[folder] = [];
      structure[folder].push(file);
    }
  });

  courseData.name    = rootPath;
  courseData.modules = [];
  allLessons         = [];

  function naturalSort(a, b) {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  }

  function getVideoDuration(file) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      const objectUrl = URL.createObjectURL(file);
      video.onloadedmetadata = () => { URL.revokeObjectURL(objectUrl); resolve(formatTime(video.duration)); };
      video.onerror         = () => { URL.revokeObjectURL(objectUrl); resolve(""); };
      video.src = objectUrl;
    });
  }

  for (const folderName of Object.keys(structure).sort()) {
    const moduleFiles = structure[folderName].sort(naturalSort);
    const lessons = [];

    for (const file of moduleFiles) {
      const fileType = getFileType(file.name);
      const duration = fileType === "video" ? await getVideoDuration(file) : "";
      lessons.push({ name: file.name, file, duration, type: fileType });
    }

    const module = {
      name: folderName === "_root" ? "Archivos principales" : folderName,
      lessons,
    };
    courseData.modules.push(module);
    allLessons.push(...module.lessons);
  }

  courseName.textContent = courseData.name;
  renderSidebar();
  if (allLessons.length > 0) loadLesson(0);
}

// ══════════════════════════════════════════
// RENDER SIDEBAR
// ══════════════════════════════════════════
function renderSidebar() {
  // Si hay búsqueda activa, refrescar resultados en vez del árbol completo
  if (searchQuery && searchQuery.trim()) { renderSearch(searchQuery); return; }
  sidebarContent.innerHTML = "";

  const r    = 11;
  const circ = 2 * Math.PI * r; // ~69.115

  // Calcular qué módulo contiene la lección activa
  let activeModuleIndex = -1;
  {
    let off = 0;
    for (let i = 0; i < courseData.modules.length; i++) {
      if (currentLessonIndex >= off && currentLessonIndex < off + courseData.modules[i].lessons.length) {
        activeModuleIndex = i; break;
      }
      off += courseData.modules[i].lessons.length;
    }
  }

  let globalOffset = 0;

  courseData.modules.forEach((module, moduleIndex) => {
    // ── Count completed in this module ──
    const lessonStart       = globalOffset;
    const completedInModule = module.lessons.filter((_, i) => completedLessons.has(lessonStart + i)).length;
    const modulePct         = module.lessons.length > 0 ? completedInModule / module.lessons.length : 0;
    const ringOffset        = circ * (1 - modulePct);

    // ── Module header ──
    const isExpanded = expandedModules.has(moduleIndex);

    const moduleEl = document.createElement("div");
    moduleEl.className = "module";

    const headerEl = document.createElement("div");
    headerEl.className = `module-header${moduleIndex === activeModuleIndex ? " active-module" : ""}`;
    headerEl.innerHTML = `
      <span class="material-icons-round module-chevron${isExpanded ? " open" : ""}">chevron_right</span>
      <div class="module-info">
        <div class="module-name">${module.name}</div>
        <div class="module-meta">${completedInModule}/${module.lessons.length} clases</div>
      </div>
      <div class="module-progress-ring">
        <svg width="28" height="28" viewBox="0 0 28 28">
          <circle class="ring-bg"   cx="14" cy="14" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="0"/>
          <circle class="ring-fill" cx="14" cy="14" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${ringOffset}"/>
        </svg>
      </div>
    `;

    headerEl.addEventListener("click", () => {
      if (expandedModules.has(moduleIndex)) {
        expandedModules.delete(moduleIndex);
      } else {
        expandedModules.add(moduleIndex);
      }
      renderSidebar();
    });

    // ── Lessons list ──
    const lessonsEl = document.createElement("div");
    lessonsEl.className = `lessons${isExpanded ? " open" : ""}`;

    module.lessons.forEach((lesson, lessonIndex) => {
      const globalIndex = lessonStart + lessonIndex;
      const isActive    = globalIndex === currentLessonIndex;
      const isDone      = completedLessons.has(globalIndex);

      const itemEl = document.createElement("div");
      itemEl.className = `lesson-item${isDone ? " completed" : ""}${isActive ? " active" : ""}`;

      // Number badge (checkmark if done, active accent if current)
      const numContent = isDone
        ? `<span class="material-icons-round" style="font-size:12px">check</span>`
        : String(lessonIndex + 1);

      // Progress bar (videos only)
      const progressEl = lesson.type === "video" ? `
        <div class="lesson-progress">
          <div class="lesson-progress-fill" style="width:${getVideoProgress(lesson.name)}%"></div>
        </div>` : "";

      // Resource button (non-video)
      const resourceBtn = lesson.type !== "video" ? `
        <button class="resource-btn" onclick="downloadResource(${globalIndex})">Descargar</button>` : "";

      itemEl.innerHTML = `
        <div class="lesson-num">${numContent}</div>
        <div class="lesson-info">
          <div class="lesson-title">${lesson.name}</div>
          <div class="lesson-dur">${lesson.duration || (lesson.type !== "video" ? lesson.type : "")}</div>
          ${progressEl}
          ${resourceBtn}
        </div>
        <span class="material-icons-round lesson-type-icon">${getTypeIcon(lesson.type)}</span>
      `;

      itemEl.addEventListener("click", () => {
        loadLesson(globalIndex);
        if (lesson.type !== "video") {
          completedLessons.add(globalIndex);
          renderSidebar();
          updateGlobalProgress();
        }
      });

      lessonsEl.appendChild(itemEl);
    });

    moduleEl.appendChild(headerEl);
    moduleEl.appendChild(lessonsEl);
    sidebarContent.appendChild(moduleEl);

    globalOffset += module.lessons.length;
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
}

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

  // Construir mapa lessonIndex → moduleName
  const moduleOf = {};
  let off = 0;
  courseData.modules.forEach((mod) => {
    mod.lessons.forEach((_, i) => { moduleOf[off + i] = mod.name; });
    off += mod.lessons.length;
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
        <span class="material-icons-round">${getTypeIcon(lesson.type)}</span>
      </div>
      <div class="search-result-info">
        <div class="search-result-name">${highlightMatch(lesson.name, query)}</div>
        <div class="search-result-meta">${escapeHtml(moduleOf[idx] || "")}${lesson.duration ? " · " + lesson.duration : ""}</div>
      </div>`;

    item.addEventListener("click", () => {
      loadLesson(idx);
      if (lesson.type !== "video") {
        completedLessons.add(idx);
        updateGlobalProgress();
      }
      // Marcar activo visualmente sin limpiar la búsqueda
      sidebarContent.querySelectorAll(".search-result-item").forEach((el) =>
        el.classList.remove("active")
      );
      item.classList.add("active");
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
  expandedModules.clear();
  renderSidebar();
});

document.getElementById("expandAll").addEventListener("click", () => {
  expandedModules.clear();
  courseData.modules.forEach((_, i) => expandedModules.add(i));
  renderSidebar();
});

// ══════════════════════════════════════════
// LOCATE CURRENT LESSON
// ══════════════════════════════════════════
locateLessonBtn.addEventListener("click", () => {
  if (currentLessonIndex < 0) return;

  // Find which module the current lesson is in and expand it
  let offset = 0;
  for (let i = 0; i < courseData.modules.length; i++) {
    const mod = courseData.modules[i];
    if (currentLessonIndex < offset + mod.lessons.length) {
      expandedModules.add(i);
      break;
    }
    offset += mod.lessons.length;
  }

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
function getVideoProgress(videoName) {
  return videoProgress[videoName] ? Math.round(videoProgress[videoName].progress) : 0;
}

function updateVideoProgress(videoName, currentTime, duration) {
  if (!videoName || !duration) return;

  const progress = (currentTime / duration) * 100;
  videoProgress[videoName] = { currentTime, duration, progress, lastUpdate: Date.now() };

  // Update sidebar bar without full re-render
  sidebarContent.querySelectorAll(".lesson-item").forEach((item) => {
    const titleEl = item.querySelector(".lesson-title");
    if (titleEl && titleEl.textContent === videoName) {
      const bar = item.querySelector(".lesson-progress-fill");
      if (bar) bar.style.width = Math.round(progress) + "%";
    }
  });

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
  const text      = container.dataset.code;
  navigator.clipboard.writeText(text).then(() => {
    const copyText = button.querySelector(".copy-text");
    const icon     = button.querySelector(".material-icons-round");
    button.classList.add("copied");
    copyText.textContent = "Copiado";
    icon.textContent     = "check";
    setTimeout(() => {
      button.classList.remove("copied");
      copyText.textContent = "Copiar";
      icon.textContent     = "content_copy";
    }, 2000);
  }).catch(() => {});
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
let previewSeekVideo = null;

function resetPreviewVideo() {
  if (previewSeekVideo) { previewSeekVideo.src = ""; previewSeekVideo = null; }
}

function loadLesson(index) {
  if (index < 0 || index >= allLessons.length) return;

  currentLessonIndex = index;
  const lesson = allLessons[index];

  // Update header
  currentLessonEl.textContent = lesson.name;
  if (headerSep) headerSep.style.display = "inline";

  contentArea.innerHTML = "";
  if (currentMedia) {
    if (currentMedia.pause) currentMedia.pause();
    currentMedia = null;
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
    const video = document.createElement("video");
    video.controls = false;

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

      if (videoProgress[lesson.name]) {
        const saved = videoProgress[lesson.name].currentTime;
        if (saved > 0 && saved < video.duration - 5) video.currentTime = saved;
      }
    });

    // Mostrar error solo si este video sigue siendo el activo
    video.addEventListener("error", () => {
      if (currentMedia !== video) return;
      contentArea.innerHTML = `
        <div class="placeholder">
          <div class="placeholder-icon"><span class="material-icons-round">videocam_off</span></div>
          <h3>Formato no compatible</h3>
          <p>El navegador no puede reproducir este archivo.<br>Intenta con MP4 (H.264) o WebM.</p>
        </div>`;
    });

    let lastProgressUpdate = 0;

    video.addEventListener("timeupdate", () => {
      updateProgress();
      updateBuffer();
      const now = Date.now();
      if (now - lastProgressUpdate > 500) {
        updateVideoProgress(lesson.name, video.currentTime, video.duration);
        lastProgressUpdate = now;
      }
    });

    video.addEventListener("ended", onMediaEnded);

    video.addEventListener("click", () => {
      if (video.paused) { video.play(); isPlaying = true; }
      else              { video.pause(); isPlaying = false; }
      updatePlayButton();
    });

    contentArea.appendChild(video);
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
    });

    video.play().then(() => { isPlaying = true; updatePlayButton(); }).catch(() => {});

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

      const container = document.createElement("div");
      container.className  = "code-display";
      container.dataset.code = codeText;

      const header = document.createElement("div");
      header.className = "code-header";
      header.innerHTML = `
        <div class="code-language">${languageName}</div>
        <button class="code-copy-btn" onclick="copyCodeToClipboard(this)">
          <span class="material-icons-round">content_copy</span>
          <span class="copy-text">Copiar</span>
        </button>`;

      const codeContent = document.createElement("div");
      codeContent.className   = "code-content";
      codeContent.textContent = codeText;

      container.appendChild(header);
      container.appendChild(codeContent);
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
  if (videoProgress[lesson.name]) {
    delete videoProgress[lesson.name];
    saveProgress();
  }

  // Reiniciar video al inicio
  if (currentMedia && currentMedia.tagName === "VIDEO") {
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
      updateVideoProgress(lesson.name, pipVideo.currentTime, pipVideo.duration);
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

progressBar.addEventListener("mousedown", (e) => {
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
  const rect       = progressBar.getBoundingClientRect();
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
// ON MEDIA ENDED
// ══════════════════════════════════════════
function onMediaEnded() {
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
// SIDEBAR TOGGLE
// ══════════════════════════════════════════
toggleSidebarBtn.addEventListener("click", () => {
  sidebar.classList.toggle("closed");
  toggleSidebarBtn.classList.toggle("sidebar-toggle-active", !sidebar.classList.contains("closed"));
});

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

function applyTheme(selectedTheme) {
  if (selectedTheme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.classList.toggle("light-mode", !prefersDark);
  } else if (selectedTheme === "light") {
    document.body.classList.add("light-mode");
  } else {
    document.body.classList.remove("light-mode");
  }
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (theme === "system") document.body.classList.toggle("light-mode", !e.matches);
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

if (previewCanvas && previewCtx) {
  const dpr = window.devicePixelRatio || 1;
  previewCanvas.width  = 160 * dpr;
  previewCanvas.height = 90  * dpr;
  previewCanvas.style.width  = "160px";
  previewCanvas.style.height = "90px";
  previewCtx.scale(dpr, dpr);
  previewCtx.imageSmoothingEnabled  = true;
  previewCtx.imageSmoothingQuality  = "high";
}

progressBar.addEventListener("mousemove", (e) => {
  if (!currentMedia || !currentMedia.duration || currentMedia.tagName !== "VIDEO") {
    progressPreview.style.display = "none";
    return;
  }

  const rect       = progressBar.getBoundingClientRect();
  const x          = e.clientX - rect.left;
  const percentage = Math.max(0, Math.min(1, x / rect.width));
  const time       = percentage * currentMedia.duration;

  const previewWidth = 160;
  const leftPos = Math.max(previewWidth / 2, Math.min(x, rect.width - previewWidth / 2));

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
          try { previewCtx.drawImage(previewSeekVideo, 0, 0, 160, 90); } catch (_) {}
        });
      }
      previewSeekVideo.currentTime = time;
    } catch (_) {}
  }
});

progressBar.addEventListener("mouseleave", () => {
  progressPreview.style.display = "none";
});
