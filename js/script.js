/**
 * ==============================
 * CONFIGURACIÓN GENERAL Y VARIABLES
 * ==============================
 */
// Datos del curso y estado general
let courseData = {
  name: "", // Nombre del curso
  modules: [], // Módulos del curso
};
let currentLessonIndex = -1; // Índice de la lección actual
let allLessons = []; // Array de todas las lecciones

// Variables de control de reproducción
let isPlaying = false; // Estado de reproducción
let currentMedia = null; // Elemento multimedia actual
let playbackSpeed = localStorage.getItem("playbackSpeed")
  ? parseFloat(localStorage.getItem("playbackSpeed"))
  : 1; // Velocidad de reproducción
let autoplay = localStorage.getItem("autoplay") === "true"; // Estado de reproducción automática

// Variables de estado y preferencias
let completedLessons = new Set(); // Registro de lecciones completadas
let theme = "system"; // Tema visual actual
let controlsVisible = true;
let expandedModules = new Set(); // Conjunto de módulos expandidos

// Funciones para acoplar/desacoplar todos los módulos
function collapseAllModules() {
  expandedModules.clear();
  renderSidebar();
}

function expandAllModules() {
  expandedModules.clear();
  courseData.modules.forEach((_, index) => expandedModules.add(index));
  renderSidebar();
}

// Agregar eventos a los botones de acoplar/desacoplar todo
document
  .getElementById("collapseAll")
  .addEventListener("click", collapseAllModules);
document
  .getElementById("expandAll")
  .addEventListener("click", expandAllModules);
let controlsTimeout;
let controlsBtnTimeout; // timeout para ocultar los botones prev/next rápidamente
let currentVolume = 100;
let isMuted = false;
let lastVolume = 100;
let videoProgress = {}; // Almacena el progreso de cada video
let isPipActive = false;
let pipVideo = null;

/**
 * ==============================
 * REFERENCIAS DOM
 * ==============================
 */
// Referencias de la interfaz principal
const folderInput = document.getElementById("folderInput");
const loadFolderBtn = document.getElementById("loadFolder");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const sidebar = document.getElementById("sidebar");
const contentArea = document.getElementById("contentArea");
const sidebarContent = document.getElementById("sidebarContent");
const courseName = document.getElementById("courseName");
const currentLessonEl = document.getElementById("currentLesson");
const playPauseBtn = document.getElementById("playPauseBtn");
const speedBtn = document.getElementById("speedBtn");
const timeDisplay = document.getElementById("timeDisplay");
const progressBar = document.getElementById("progressBar");
const progressFilled = document.getElementById("progressFilled");
const prevLessonBtn = document.getElementById("prevLesson");
const nextLessonBtn = document.getElementById("nextLesson");
const rewindBtn = document.getElementById("rewindBtn");
const forwardBtn = document.getElementById("forwardBtn");
const settingsBtn = document.getElementById("settingsBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const settingsMenu = document.getElementById("settingsMenu");
const toggleSwitch = document.getElementById("toggleSwitch");
const themeMenuItem = document.getElementById("themeMenuItem");
const themeSubmenu = document.getElementById("themeSubmenu");
const speedMenuItem = document.getElementById("speedMenuItem");
const speedSubmenu = document.getElementById("speedSubmenu");
const autoplayMenuItem = document.getElementById("autoplayMenuItem");
const videoSection = document.querySelector(".video-section");
const volumeBtn = document.getElementById("volumeBtn");
const volumeSliderContainer = document.getElementById("volumeSliderContainer");
const volumeSlider = document.getElementById("volumeSlider");
const volumePercentage = document.getElementById("volumePercentage");
const pipBtn = document.getElementById("pipBtn");
const customPipBtn = document.getElementById("customPipBtn");
const pipOverlay = document.getElementById("pipOverlay");
const pipVideoContainer = document.getElementById("pipVideoContainer");
const pipTitle = document.getElementById("pipTitle");
const pipClose = document.getElementById("pipClose");
const pipMinimize = document.getElementById("pipMinimize");
const pipHeader = document.getElementById("pipHeader");

const controlsOverlay = document.querySelector(".controls-overlay");

/**
 * ==============================
 * GESTIÓN DE PROGRESO
 * ==============================
 */
// Cargar progreso guardado desde localStorage
function loadProgress() {
  const saved = localStorage.getItem("videoProgress");
  if (saved) {
    try {
      videoProgress = JSON.parse(saved);
    } catch (e) {
      videoProgress = {};
      console.error("Error al cargar el progreso:", e);
    }
  }
}

// Guardar progreso en localStorage
function saveProgress() {
  try {
    localStorage.setItem("videoProgress", JSON.stringify(videoProgress));
  } catch (e) {
    console.error("Error al guardar el progreso:", e);
  }
}

// Inicializar progreso al cargar
loadProgress();

/**
 * ==============================
 * GESTIÓN DE CARGA DE ARCHIVOS
 * ==============================
 */
// Manejador de clic para el botón de carga
loadFolderBtn.addEventListener("click", () => {
  folderInput.click();
});

// Manejador de cambio para el input de archivos
folderInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) {
    console.log("No se seleccionaron archivos");
    return;
  }

  await processFolder(files);
});
/**
 * ==============================
 * PROCESAMIENTO DE CARPETAS Y ARCHIVOS
 * ==============================
 */
function processFolder(files) {
  const structure = {};
  const rootPath = files[0].webkitRelativePath.split("/")[0];

  // Configuración de tipos de archivos
  const validExtensions = [
    // Archivos de video
    "mp4",
    "webm",
    "ogg",
    "mov",
    "avi",
    // Documentos
    "pdf",
    // Código fuente
    "js",
    "html",
    "css",
    "py",
    "java",
    "cpp",
    "sql",
    "c",
    // Texto y documentación
    "txt",
    "md",
  ];
  const excludedFiles = [".DS_Store", "Thumbs.db", ".gitignore"];

  files.forEach((file) => {
    const ext = file.name.split(".").pop().toLowerCase();

    // Excluir archivos con extensiones no válidas o archivos como .DS_Store
    if (!validExtensions.includes(ext) || excludedFiles.includes(file.name)) {
      return; // Salir si el archivo no es válido
    }

    const pathParts = file.webkitRelativePath.split("/");
    pathParts.shift();

    if (pathParts.length === 1) {
      if (!structure["_root"]) structure["_root"] = [];
      structure["_root"].push(file);
    } else {
      const folderName = pathParts[0];
      if (!structure[folderName]) structure[folderName] = [];
      structure[folderName].push(file);
    }
  });

  courseData.name = rootPath;
  courseData.modules = [];
  allLessons = [];

  Object.keys(structure)
    .sort()
    .forEach((folderName, index) => {
      const moduleFiles = structure[folderName];
      const module = {
        name: folderName === "_root" ? "Archivos principales" : folderName,
        lessons: moduleFiles.map((file) => ({
          name: file.name,
          file: file,
          duration: "0:00",
          type: getFileType(file.name),
        })),
      };

      courseData.modules.push(module);
      allLessons.push(...module.lessons);
    });

  renderSidebar();
  courseName.textContent = courseData.name;

  if (allLessons.length > 0) {
    loadLesson(0);
  }
}

// Función para obtener el tipo de archivo
function getFileType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const videoExts = ["mp4", "webm", "ogg", "mov", "avi"];
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
  const codeExts = [
    "js",
    "html",
    "css",
    "json",
    "py",
    "java",
    "cpp",
    "sql",
    "c",
    "txt",
    "md",
  ];
  const pdfExts = ["pdf"];

  if (videoExts.includes(ext)) return "video";
  if (imageExts.includes(ext)) return "image";
  if (codeExts.includes(ext)) return "code";
  if (pdfExts.includes(ext)) return "pdf";
  return "unknown";
}

async function processFolder(files) {
  const structure = {};
  const rootPath = files[0].webkitRelativePath.split("/")[0];

  // Configuración de tipos de archivos
  const validExtensions = [
    // Archivos de video
    "mp4",
    "webm",
    "ogg",
    "mov",
    "avi",
    // Documentos
    "pdf",
    // Código fuente
    "js",
    "html",
    "css",
    "py",
    "java",
    "cpp",
    "c",
    // Texto y documentación
    "txt",
    "md",
  ];
  const excludedFiles = [".DS_Store", "Thumbs.db", ".gitignore"];

  files.forEach((file) => {
    const ext = file.name.split(".").pop().toLowerCase();

    if (!validExtensions.includes(ext) || excludedFiles.includes(file.name)) {
      return;
    }

    const pathParts = file.webkitRelativePath.split("/");
    pathParts.shift();

    if (pathParts.length === 1) {
      if (!structure["_root"]) structure["_root"] = [];
      structure["_root"].push(file);
    } else {
      const folderName = pathParts[0];
      if (!structure[folderName]) structure[folderName] = [];
      structure[folderName].push(file);
    }
  });

  courseData.name = rootPath;
  courseData.modules = [];
  allLessons = [];

  // Función para ordenar de forma natural (números y letras)
  function naturalSort(a, b) {
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  // Función para obtener duración de video
  function getVideoDuration(file) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = function () {
        window.URL.revokeObjectURL(video.src);
        resolve(formatTime(video.duration));
      };
      video.onerror = function () {
        resolve("0:00");
      };
      video.src = URL.createObjectURL(file);
    });
  }

  // Procesar módulos
  for (const folderName of Object.keys(structure).sort()) {
    const moduleFiles = structure[folderName].sort(naturalSort);
    const lessons = [];

    for (const file of moduleFiles) {
      const fileType = getFileType(file.name);
      let duration = "";

      // Obtener duración solo para videos
      if (fileType === "video") {
        duration = await getVideoDuration(file);
      }

      lessons.push({
        name: file.name,
        file: file,
        duration: duration,
        type: fileType,
      });
    }

    const module = {
      name: folderName === "_root" ? "Archivos principales" : folderName,
      lessons: lessons,
    };

    courseData.modules.push(module);
    allLessons.push(...module.lessons);
  }

  renderSidebar();
  courseName.textContent = courseData.name;

  if (allLessons.length > 0) {
    loadLesson(0);
  }
}

function renderSidebar() {
  sidebarContent.innerHTML = "";

  courseData.modules.forEach((module, moduleIndex) => {
    const sectionHeader = document.createElement("div");
    sectionHeader.className = "section-header";
    sectionHeader.innerHTML = `
            <div>
                <div>${module.name}</div>
                <span class="section-info">${module.lessons.length} clases</span>
            </div>
            <span class="section-toggle">▼</span>
        `;

    const lessonsContainer = document.createElement("div");
    lessonsContainer.className = "section-lessons"; // Por defecto colapsado, sin 'expanded'

    module.lessons.forEach((lesson, lessonIndex) => {
      const globalIndex = allLessons.indexOf(lesson);
      const lessonItem = document.createElement("div");
      lessonItem.className = "lesson-item";
      if (completedLessons.has(globalIndex)) {
        lessonItem.classList.add("completed");
      }
      if (globalIndex === currentLessonIndex) {
        lessonItem.classList.add("active");
      }

      // Agregar un botón "Recurso" si el archivo no es video
      let resourceBtn = "";
      let progressBar = ""; // Se inicializa la variable para la barra de progreso
      let lessonDuration = ""; // Variable para el icono del tipo de archivo

      if (lesson.type !== "video") {
        resourceBtn = `
                    <button class="resource-btn" onclick="downloadResource(${globalIndex})">Descargar Recurso</button>
                `;
        lessonDuration = ""; // No mostrar el ícono de tipo archivo si no es video
      } else {
        // Solo agregar la barra de progreso y el ícono de tipo archivo para videos
        progressBar = `
                    <div class="lesson-progress">
                        <div class="lesson-progress-filled" style="width: ${getVideoProgress(
                          lesson.name
                        )}%"></div>
                    </div>
                `;
        // lessonDuration = `${getFileIcon(lesson.type)} ${lesson.type}`; // Mostrar ícono y tipo de archivo solo para videos
        lessonDuration = `${getFileIcon(lesson.type)} ${
          lesson.duration || lesson.type
        }`; // Mostrar ícono y tipo de archivo solo para videos
      }

      lessonItem.innerHTML = `
                <div class="checkbox"></div>
                <div class="lesson-info">
                    <div class="lesson-name">${lesson.name}</div>
                    <div class="lesson-duration">${lessonDuration}</div>
                    ${progressBar}
                    ${resourceBtn}
                </div>
            `;

      lessonItem.addEventListener("click", () => {
        loadLesson(globalIndex);

        // Marcar como completado si NO es video
        if (lesson.type !== "video") {
          completedLessons.add(globalIndex);
          renderSidebar();
        }
      });

      lessonsContainer.appendChild(lessonItem);
    });

    sectionHeader.addEventListener("click", () => {
      if (expandedModules.has(moduleIndex)) {
        expandedModules.delete(moduleIndex);
      } else {
        expandedModules.add(moduleIndex);
      }
      renderSidebar();
    });

    // Actualizar estado visual basado en expandedModules
    const isExpanded = expandedModules.has(moduleIndex);
    lessonsContainer.classList.toggle("expanded", isExpanded);
    sectionHeader.querySelector(".section-toggle").textContent = isExpanded
      ? "▼"
      : "▶";

    sidebarContent.appendChild(sectionHeader);
    sidebarContent.appendChild(lessonsContainer);
  });
}

// Función para manejar la descarga de recursos
function downloadResource(index) {
  const lesson = allLessons[index];
  const url = URL.createObjectURL(lesson.file);

  const a = document.createElement("a");
  a.href = url;
  a.download = lesson.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getFileIcon(type) {
  const icons = {
    video: "▶️",
    image: "🖼️",
    code: "📄",
    pdf: "📕",
    unknown: "📎",
  };
  return icons[type] || icons.unknown;
}

function getVideoProgress(videoName) {
  if (videoProgress[videoName]) {
    return Math.round(videoProgress[videoName].progress);
  }
  return 0;
}

/**
 * ==============================
 * GESTIÓN DE PROGRESO DE VIDEO
 * ==============================
 */
function updateVideoProgress(videoName, currentTime, duration) {
  if (!videoName || !duration) return;

  // Calcular y almacenar el progreso
  const progress = (currentTime / duration) * 100;
  videoProgress[videoName] = {
    currentTime: currentTime,
    duration: duration,
    progress: progress,
    lastUpdate: Date.now(),
  };

  function updateLessonProgressBar(videoName, progress) {
    // Buscar la lección en el DOM y actualizar solo su barra de progreso
    const lessonItems = document.querySelectorAll(".lesson-item");
    lessonItems.forEach((item) => {
      const lessonNameEl = item.querySelector(".lesson-name");
      if (lessonNameEl && lessonNameEl.textContent === videoName) {
        const progressBar = item.querySelector(".lesson-progress-filled");
        if (progressBar) {
          progressBar.style.width = Math.round(progress) + "%";
        }
      }
    });
  }

  // Actualizar solo la barra de progreso específica sin redibujar todo
  updateLessonProgressBar(videoName, progress);

  // Guardar progreso cada 5 segundos en lugar de cada frame
  if (!this.lastSaveTime || Date.now() - this.lastSaveTime > 5000) {
    saveProgress();
    this.lastSaveTime = Date.now();
  }
}
/**
 * ==============================
 * CARGA Y REPRODUCCIÓN DE LECCIONES
 * ==============================
 */
function loadLesson(index) {
  // Validar índice
  if (index < 0 || index >= allLessons.length) {
    console.warn("Índice de lección inválido:", index);
    return;
  }

  // Actualizar estado
  currentLessonIndex = index;
  const lesson = allLessons[index];

  currentLessonEl.textContent = `: ${lesson.name}`;

  contentArea.innerHTML = "";
  if (currentMedia) {
    if (currentMedia.pause) currentMedia.pause();
    currentMedia = null;
  }
  isPlaying = false;
  updatePlayButton();

  const reader = new FileReader();

  if (lesson.type === "video") {
    reader.onload = (e) => {
      const video = document.createElement("video");
      video.src = e.target.result;
      video.controls = false;

      video.addEventListener("loadedmetadata", () => {
        updateTimeDisplay();
        // Guardar duración del video
        const lesson = allLessons[index];
        lesson.duration = formatTime(video.duration);
        renderSidebar();

        // Restaurar progreso guardado
        if (videoProgress[lesson.name]) {
          const savedTime = videoProgress[lesson.name].currentTime;
          if (savedTime > 0 && savedTime < video.duration - 5) {
            video.currentTime = savedTime;
          }
        }
      });

      let lastProgressUpdate = 0;

      video.addEventListener("timeupdate", () => {
        updateProgress();

        // Actualizar la barra de progreso cada 500ms en lugar de cada frame
        const now = Date.now();
        if (now - lastProgressUpdate > 500) {
          updateVideoProgress(lesson.name, video.currentTime, video.duration);
          lastProgressUpdate = now;
        }
      });
      video.addEventListener("ended", onMediaEnded);

      video.addEventListener("click", (e) => {
        // No detener la propagación si el click es en el área del video
        // Solo detener si es en los controles
        if (e.target.closest(".video-controls")) {
          e.stopPropagation();
        }

        // Controlar reproducción/pausa para cualquier click en el video
        if (video.paused) {
          video.play();
          isPlaying = true;
        } else {
          video.pause();
          isPlaying = false;
        }
        updatePlayButton();
      });

      contentArea.appendChild(video);
      currentMedia = video;

      // Aplicar velocidad guardada
      const savedSpeed = localStorage.getItem("playbackSpeed");
      video.playbackRate = savedSpeed ? parseFloat(savedSpeed) : 1;
      speedBtn.textContent = video.playbackRate + "x";

      // Restaurar el volumen guardado antes de asignar el valor por defecto
      const savedVolume = localStorage.getItem("videoVolume");
      if (savedVolume !== null) {
        video.volume = parseFloat(savedVolume);
        currentVolume = video.volume * 100;
        if (typeof volumeSlider !== "undefined")
          volumeSlider.value = currentVolume;
        if (typeof updateVolumeSlider === "function") updateVolumeSlider();
      } else {
        video.volume = currentVolume / 100;
        if (typeof volumeSlider !== "undefined")
          volumeSlider.value = currentVolume;
        if (typeof updateVolumeSlider === "function") updateVolumeSlider();
      }

      video
        .play()
        .then(() => {
          isPlaying = true;
          updatePlayButton();
        })
        .catch(() => {
          console.log("El navegador bloqueó la reproducción automática");
        });

      // Agregar evento para guardar el volumen cada vez que se cambie
      video.addEventListener("volumechange", () => {
        localStorage.setItem("videoVolume", video.volume);
      });
    };
    reader.readAsDataURL(lesson.file);
  } else if (lesson.type === "image") {
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.src = e.target.result;
      contentArea.appendChild(img);
    };
    reader.readAsDataURL(lesson.file);
  } else if (lesson.type === "code") {
    reader.onload = (e) => {
      const codeText = e.target.result;
      const extension = lesson.name.split(".").pop().toLowerCase();
      const languageName = getLanguageName(extension);

      const codeContainer = document.createElement("div");
      codeContainer.className = "code-display";

      const codeHeader = document.createElement("div");
      codeHeader.className = "code-header";
      codeHeader.innerHTML = `
            <div class="code-language">${languageName}</div>
            <button class="code-copy-btn" onclick="copyCodeToClipboard(this)">
                <span class="material-icons">content_copy</span>
                <span class="copy-text">Copiar</span>
            </button>
        `;

      const codeContent = document.createElement("div");
      codeContent.className = "code-content";
      codeContent.textContent = codeText;

      codeContainer.appendChild(codeHeader);
      codeContainer.appendChild(codeContent);
      contentArea.appendChild(codeContainer);

      // Guardar el código para copiar
      codeContainer.dataset.code = codeText;
    };
    reader.readAsText(lesson.file);
  } else if (lesson.type === "pdf") {
    reader.onload = (e) => {
      const iframe = document.createElement("iframe");
      iframe.src = e.target.result;
      contentArea.appendChild(iframe);
    };
    reader.readAsDataURL(lesson.file);
  } else {
    contentArea.innerHTML =
      '<div class="placeholder-message">Formato no soportado</div>';
  }

  renderSidebar();
  updateNavigationButtons();
}

function updatePlayButton() {
  const icon = playPauseBtn.querySelector(".material-icons");
  if (!icon) return;
  if (isPlaying) {
    icon.textContent = "pause";
  } else {
    icon.textContent = "play_arrow";
  }
}

playPauseBtn.addEventListener("click", () => {
  if (!currentMedia) return;

  if (isPlaying) {
    currentMedia.pause();
    isPlaying = false;
  } else {
    currentMedia.play();
    isPlaying = true;
  }
  updatePlayButton();
});

speedBtn.addEventListener("click", () => {
  if (!currentMedia) return;

  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const currentIndex = speeds.indexOf(playbackSpeed);
  playbackSpeed = speeds[(currentIndex + 1) % speeds.length];
  currentMedia.playbackRate = playbackSpeed;
  speedBtn.textContent = playbackSpeed + "x";
  localStorage.setItem("playbackSpeed", playbackSpeed);
});

rewindBtn.addEventListener("click", () => {
  if (!currentMedia) return;
  currentMedia.currentTime = Math.max(0, currentMedia.currentTime - 10);
});

forwardBtn.addEventListener("click", () => {
  if (!currentMedia) return;
  currentMedia.currentTime = Math.min(
    currentMedia.duration,
    currentMedia.currentTime + 10
  );
});

fullscreenBtn.addEventListener("click", () => {
  const videoSection = document.querySelector(".video-section");
  const icon = fullscreenBtn.querySelector(".material-icons");
  if (!document.fullscreenElement) {
    if (videoSection.requestFullscreen) {
      videoSection.requestFullscreen();
    } else if (videoSection.webkitRequestFullscreen) {
      videoSection.webkitRequestFullscreen();
    } else if (videoSection.msRequestFullscreen) {
      videoSection.msRequestFullscreen();
    }
    if (icon) icon.textContent = "fullscreen_exit";
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
    if (icon) icon.textContent = "fullscreen";
  }
});

// Picture in Picture (nativo del navegador)
pipBtn.addEventListener("click", async () => {
  if (!currentMedia || currentMedia.tagName !== "VIDEO") return;

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await currentMedia.requestPictureInPicture();
    }
  } catch (error) {
    console.log("Error con Picture-in-Picture:", error);
  }
});

// Picture in Picture personalizado (ventana flotante)
customPipBtn.addEventListener("click", () => {
  if (!currentMedia || currentMedia.tagName !== "VIDEO") return;

  if (isPipActive) {
    closePip();
  } else {
    openPip();
  }
});

// Obtener nombre del lenguaje por extensión
function getLanguageName(ext) {
  const languages = {
    js: "JavaScript",
    py: "Python",
    java: "Java",
    cpp: "C++",
    c: "C",
    cs: "C#",
    html: "HTML",
    css: "CSS",
    sql: "SQL",
    json: "JSON",
    xml: "XML",
    php: "PHP",
    rb: "Ruby",
    go: "Go",
    rs: "Rust",
    ts: "TypeScript",
    jsx: "React JSX",
    tsx: "React TSX",
    md: "Markdown",
    txt: "Text",
    sh: "Shell",
    bash: "Bash",
    yml: "YAML",
    yaml: "YAML",
  };
  return languages[ext] || ext.toUpperCase();
}

// Copiar código al portapapeles
function copyCodeToClipboard(button) {
  const codeContainer = button.closest(".code-display");
  const codeText = codeContainer.dataset.code;

  navigator.clipboard
    .writeText(codeText)
    .then(() => {
      // Cambiar estado del botón
      const copyText = button.querySelector(".copy-text");
      const icon = button.querySelector(".material-icons");

      button.classList.add("copied");
      copyText.textContent = "Copiado";
      icon.textContent = "check";

      // Restaurar después de 2 segundos
      setTimeout(() => {
        button.classList.remove("copied");
        copyText.textContent = "Copiar";
        icon.textContent = "content_copy";
      }, 2000);
    })
    .catch((err) => {
      console.error("Error al copiar:", err);
    });
}

function openPip() {
  if (!currentMedia || isPipActive) return;

  isPipActive = true;
  const currentTime = currentMedia.currentTime;
  const isPlaying = !currentMedia.paused;

  // Clonar el video
  pipVideo = currentMedia.cloneNode(true);
  pipVideo.src = currentMedia.src;
  pipVideo.currentTime = currentTime;
  pipVideo.volume = currentMedia.volume;
  pipVideo.playbackRate = currentMedia.playbackRate;
  pipVideo.controls = true;

  // Pausar el video original
  currentMedia.pause();

  // Agregar el video clonado al contenedor PiP
  pipVideoContainer.innerHTML = "";
  pipVideoContainer.appendChild(pipVideo);

  // Actualizar título
  const lesson = allLessons[currentLessonIndex];
  pipTitle.textContent = lesson ? lesson.name : "Video";

  // Mostrar la ventana PiP
  pipOverlay.classList.add("active");

  // Reproducir si estaba reproduciendo
  if (isPlaying) {
    pipVideo.play();
  }

  // Sincronizar progreso
  pipVideo.addEventListener("timeupdate", () => {
    if (currentMedia && lesson) {
      currentMedia.currentTime = pipVideo.currentTime;
      updateVideoProgress(lesson.name, pipVideo.currentTime, pipVideo.duration);
    }
  });

  // Actualizar icono del botón
  const icon = customPipBtn.querySelector(".material-icons");
  icon.textContent = "close_fullscreen";
}

function closePip() {
  if (!isPipActive) return;

  const currentTime = pipVideo ? pipVideo.currentTime : 0;
  const isPlaying = pipVideo ? !pipVideo.paused : false;

  // Restaurar tiempo en el video original
  if (currentMedia) {
    currentMedia.currentTime = currentTime;
    if (isPlaying) {
      currentMedia.play();
      isPlaying = true;
      updatePlayButton();
    }
  }

  // Limpiar
  pipVideoContainer.innerHTML = "";
  pipVideo = null;
  isPipActive = false;
  pipOverlay.classList.remove("active");

  // Restaurar icono del botón
  const icon = customPipBtn.querySelector(".material-icons");
  icon.textContent = "open_in_new";
}

// Cerrar PiP
pipClose.addEventListener("click", () => {
  closePip();
});

// Minimizar PiP (reducir tamaño)
pipMinimize.addEventListener("click", () => {
  if (pipOverlay.style.width === "300px") {
    pipOverlay.style.width = "400px";
    pipOverlay.style.height = "225px";
  } else {
    pipOverlay.style.width = "300px";
    pipOverlay.style.height = "169px";
  }
});

// Hacer la ventana PiP arrastrable
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;

pipHeader.addEventListener("mousedown", (e) => {
  if (e.target.closest(".pip-control-btn")) return;

  isDragging = true;
  initialX = e.clientX - pipOverlay.offsetLeft;
  initialY = e.clientY - pipOverlay.offsetTop;
  pipHeader.style.cursor = "grabbing";
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  e.preventDefault();
  currentX = e.clientX - initialX;
  currentY = e.clientY - initialY;

  // Limitar al viewport
  const maxX = window.innerWidth - pipOverlay.offsetWidth;
  const maxY = window.innerHeight - pipOverlay.offsetHeight;

  currentX = Math.max(0, Math.min(currentX, maxX));
  currentY = Math.max(0, Math.min(currentY, maxY));

  pipOverlay.style.left = currentX + "px";
  pipOverlay.style.top = currentY + "px";
  pipOverlay.style.right = "auto";
  pipOverlay.style.bottom = "auto";
});

document.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    pipHeader.style.cursor = "move";
  }
});

let isDraggingProgress = false;

progressBar.addEventListener("mousedown", (e) => {
  if (!currentMedia || !currentMedia.duration) return;
  isDraggingProgress = true;
  updateProgressFromMouse(e);
});

document.addEventListener("mousemove", (e) => {
  if (!isDraggingProgress) return;
  updateProgressFromMouse(e);
});

document.addEventListener("mouseup", () => {
  isDraggingProgress = false;
});

function updateProgressFromMouse(e) {
  if (!currentMedia || !currentMedia.duration) return;

  const rect = progressBar.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const percentage = x / rect.width;

  currentMedia.currentTime = percentage * currentMedia.duration;
  progressFilled.style.width = percentage * 100 + "%";
  updateTimeDisplay();
}

function updateProgress() {
  if (!currentMedia || !currentMedia.duration) return;

  const percentage = (currentMedia.currentTime / currentMedia.duration) * 100;
  progressFilled.style.width = percentage + "%";
  updateTimeDisplay();
}

function updateTimeDisplay() {
  if (!currentMedia || !currentMedia.duration) {
    timeDisplay.textContent = "0:00 / 0:00";
    return;
  }

  const current = formatTime(currentMedia.currentTime);
  const total = formatTime(currentMedia.duration);
  timeDisplay.textContent = `${current} / ${total}`;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function onMediaEnded() {
  completedLessons.add(currentLessonIndex);
  renderSidebar();

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

toggleSidebarBtn.addEventListener("click", () => {
  sidebar.classList.toggle("hidden");
});

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsMenu.classList.toggle("show");
  volumeSliderContainer.classList.remove("show");
  themeSubmenu.style.display = "none";
  speedSubmenu.style.display = "none";
});

document.addEventListener("click", (e) => {
  if (!settingsMenu.contains(e.target) && e.target !== settingsBtn) {
    settingsMenu.classList.remove("show");
  }
  if (!volumeSliderContainer.contains(e.target) && e.target !== volumeBtn) {
    volumeSliderContainer.classList.remove("show");
  }
});

// Configurar el estado inicial del toggle de autoplay
if (autoplay) {
  toggleSwitch.classList.add("active");
}

autoplayMenuItem.addEventListener("click", () => {
  autoplay = !autoplay;
  if (autoplay) {
    toggleSwitch.classList.add("active");
  } else {
    toggleSwitch.classList.remove("active");
  }
  // Guardar el estado en localStorage
  localStorage.setItem("autoplay", autoplay);
});

themeMenuItem.addEventListener("click", () => {
  const isVisible = themeSubmenu.style.display === "block";
  themeSubmenu.style.display = isVisible ? "none" : "block";
  speedSubmenu.style.display = "none";
});

document.querySelectorAll("[data-theme]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    const selectedTheme = item.dataset.theme;
    theme = selectedTheme;

    localStorage.setItem("theme", selectedTheme);

    document
      .querySelectorAll("[data-theme]")
      .forEach((el) => el.classList.remove("active"));
    item.classList.add("active");
    document.getElementById("currentTheme").textContent = item.textContent;

    applyTheme(selectedTheme);
    themeSubmenu.style.display = "none";
  });
});

function applyTheme(selectedTheme) {
  if (selectedTheme === "system") {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    document.body.classList.toggle("light-mode", !prefersDark);
  } else if (selectedTheme === "light") {
    document.body.classList.add("light-mode");
  } else {
    document.body.classList.remove("light-mode");
  }
}

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", (e) => {
    if (theme === "system") {
      document.body.classList.toggle("light-mode", !e.matches);
    }
  });

speedMenuItem.addEventListener("click", () => {
  const isVisible = speedSubmenu.style.display === "block";
  speedSubmenu.style.display = isVisible ? "none" : "block";
  themeSubmenu.style.display = "none";
});

document.querySelectorAll("[data-speed]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    const speed = parseFloat(item.dataset.speed);
    playbackSpeed = speed;

    if (currentMedia) {
      currentMedia.playbackRate = speed;
    }

    document
      .querySelectorAll("[data-speed]")
      .forEach((el) => el.classList.remove("active"));
    item.classList.add("active");
    const speedText = speed === 1 ? "Normal" : speed + "x";
    document.getElementById("currentSpeed").textContent = speedText;
    speedBtn.textContent = speed + "x";
    speedSubmenu.style.display = "none";
  });
});

videoSection.addEventListener("mousemove", () => {
  showControls();
});

videoSection.addEventListener("mouseleave", () => {
  if (isPlaying && currentMedia && document.fullscreenElement) {
    hideControls();
  }
});

function showControls() {
  controlsOverlay.classList.add("visible");
  prevLessonBtn.style.opacity = "1";
  nextLessonBtn.style.opacity = "1";

  // Ocultar rápidamente los botones prev/next después de 1s si no hay interacción
  clearTimeout(controlsBtnTimeout);
  controlsBtnTimeout = setTimeout(() => {
    prevLessonBtn.style.opacity = "0";
    nextLessonBtn.style.opacity = "0";
  }, 400);

  // Mantener la lógica previa para ocultar el overlay en fullscreen
  clearTimeout(controlsTimeout);
  if (isPlaying && currentMedia && document.fullscreenElement) {
    controlsTimeout = setTimeout(() => {
      hideControls();
    }, 400);
  }
}

function hideControls() {
  if (!document.fullscreenElement) return; // No ocultar el overlay si no está en pantalla completa
  // Limpiar timeouts relacionados
  clearTimeout(controlsBtnTimeout);
  clearTimeout(controlsTimeout);

  controlsOverlay.classList.remove("visible");
  prevLessonBtn.style.opacity = "0";
  nextLessonBtn.style.opacity = "0";
}

const savedTheme = localStorage.getItem("theme") || "system";
theme = savedTheme;
applyTheme(theme);
document.querySelectorAll("[data-theme]").forEach((el) => {
  el.classList.toggle("active", el.dataset.theme === theme);
});
document.getElementById("currentTheme").textContent =
  document.querySelector(`[data-theme="${theme}"]`)?.textContent || "Sistema";

// Control de volumen (solo mutear/activar con un clic)
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
  volumePercentage.textContent = volume + "%";

  if (currentMedia) {
    currentMedia.volume = volume / 100;
  }

  const icon = volumeBtn.querySelector(".material-icons");
  if (volume === 0) {
    icon.textContent = "volume_off";
    isMuted = true;
  } else if (volume < 50) {
    icon.textContent = "volume_down";
    isMuted = false;
  } else {
    icon.textContent = "volume_up";
    isMuted = false;
  }

  if (volume > 0) {
    lastVolume = volume;
  }
}

function changeVolume(delta) {
  const newVolume = Math.max(0, Math.min(100, currentVolume + delta));
  volumeSlider.value = newVolume;
  setVolume(newVolume);
}

function toggleMute() {
  if (isMuted || currentVolume === 0) {
    const restoreVolume = lastVolume || 100;
    volumeSlider.value = restoreVolume;
    setVolume(restoreVolume);
  } else {
    lastVolume = currentVolume;
    volumeSlider.value = 0;
    setVolume(0);
  }
}

volumeBtn.addEventListener("dblclick", (e) => {
  e.stopPropagation();
  toggleMute();
});

// Atajos de teclado
document.addEventListener("keydown", (e) => {
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
  }
});

// Agregar un listener para el doble clic en la sección del video
videoSection.addEventListener("dblclick", () => {
  toggleFullscreen();
});

// Función para alternar entre pantalla completa y pantalla normal
function toggleFullscreen() {
  const videoSection = document.querySelector(".video-section");
  const icon = fullscreenBtn.querySelector(".material-icons");

  if (!document.fullscreenElement) {
    // Si no está en pantalla completa, entramos en modo pantalla completa
    if (videoSection.requestFullscreen) {
      videoSection.requestFullscreen();
    } else if (videoSection.webkitRequestFullscreen) {
      // Safari
      videoSection.webkitRequestFullscreen();
    } else if (videoSection.msRequestFullscreen) {
      // IE/Edge
      videoSection.msRequestFullscreen();
    }
    if (icon) icon.textContent = "fullscreen_exit";
  } else {
    // Si ya está en pantalla completa, salimos
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      // Safari
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      // IE/Edge
      document.msExitFullscreen();
    }
    if (icon) icon.textContent = "fullscreen";
  }
}

// Referencias para la previsualización
const progressPreview = document.getElementById("progressPreview");
const previewCanvas = document.getElementById("previewCanvas");
const previewTime = document.getElementById("previewTime");
const previewCtx = previewCanvas
  ? previewCanvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    })
  : null;

// Configurar canvas para mejor calidad
if (previewCanvas && previewCtx) {
  const dpr = window.devicePixelRatio || 1;
  previewCanvas.width = 160 * dpr;
  previewCanvas.height = 90 * dpr;
  previewCanvas.style.width = "160px";
  previewCanvas.style.height = "90px";
  previewCtx.scale(dpr, dpr);
  previewCtx.imageSmoothingEnabled = true;
  previewCtx.imageSmoothingQuality = "high";
}
// Evento mousemove para mostrar previsualización
progressBar.addEventListener("mousemove", (e) => {
  if (
    !currentMedia ||
    !currentMedia.duration ||
    currentMedia.tagName !== "VIDEO"
  ) {
    progressPreview.style.display = "none";
    return;
  }

  const rect = progressBar.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percentage = Math.max(0, Math.min(1, x / rect.width));
  const time = percentage * currentMedia.duration;

  // Posicionar la previsualización
  const previewWidth = 160;
  let leftPosition = x;

  // Ajustar si se sale por la izquierda
  if (leftPosition < previewWidth / 2) {
    leftPosition = previewWidth / 2;
  }

  // Ajustar si se sale por la derecha
  if (leftPosition > rect.width - previewWidth / 2) {
    leftPosition = rect.width - previewWidth / 2;
  }

  progressPreview.style.left = leftPosition + "px";
  progressPreview.style.display = "block";

  // Actualizar tiempo
  previewTime.textContent = formatTime(time);

  // Capturar frame del video
  if (previewCtx && currentMedia.readyState >= 2) {
    try {
      // Crear un video temporal para capturar el frame
      const tempVideo = document.createElement("video");
      tempVideo.src = currentMedia.src;
      tempVideo.currentTime = time;
      tempVideo.muted = true;

      tempVideo.addEventListener(
        "seeked",
        function captureFrame() {
          try {
            previewCtx.drawImage(tempVideo, 0, 0, 160, 90); // Era 160, 90
            tempVideo.removeEventListener("seeked", captureFrame);
          } catch (e) {
            console.log("Error al capturar frame:", e);
          }
        },
        { once: true }
      );
    } catch (e) {
      console.log("Error en previsualización:", e);
    }
  }
});

progressBar.addEventListener("mouseleave", () => {
  progressPreview.style.display = "none";
});
