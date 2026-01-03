const { ipcRenderer } = require("electron");
const path = require("path");

let currentCourses = [];
let activeCourseIndex = null;
let activeLessonIndex = null;
let activeLessonPath = null;
let saveTimeout = null;

// Variáveis Globais Novas
let quill; // Instância do Editor de Texto
let transcriptSegments = []; // Dados de tempo da legenda

let currentDate = new Date();
let studyChecklist = JSON.parse(localStorage.getItem("studyChecklist")) || {}; // Formato: "YYYY-MM-DD": true

// --- GAMIFICATION STATE ---
let userProfile = JSON.parse(localStorage.getItem("userProfile")) || {
  xp: 0,
  level: 1,
  totalWatchTime: 0,
  badges: [],
  pomoSessions: 0, // Inicializado!
  canvasDrawings: 0, // Novo: Contador de desenhos
  dailyHistory: {}, // Novo: { "2023-10-27": 5 } (aulas por dia)
  xpLog: [], // Novo: Histórico de ganhos
  streakRecord: 0, // Novo: Recorde histórico
};

// Definição dos Ranks
const RANKS = [
  { name: "Novato", minXP: 0 },
  { name: "Aprendiz", minXP: 101 },
  { name: "Estudante", minXP: 501 },
  { name: "Dedicado", minXP: 1501 },
  { name: "Expert", minXP: 3001 },
  { name: "Mestre", minXP: 6001 },
  { name: "Sábio", minXP: 10001 },
  { name: "Lenda", minXP: 20000 },
];

// Definição das Badges
const BADGES = {
  // --- INICIANTES ---
  first_lesson: {
    icon: "fa-play",
    name: "Primeiro Passo",
    desc: "Assistiu a primeira aula",
    xp: 20,
  },
  annotator: {
    icon: "fa-pen",
    name: "Anotador",
    desc: "Fez sua primeira anotação",
    xp: 30,
  },

  // --- STREAK (CONSTÂNCIA) ---
  dedicated: {
    icon: "fa-fire",
    name: "Iniciante Dedicado",
    desc: "3 dias seguidos de estudo",
    xp: 50,
  },
  week_streak: {
    icon: "fa-fire-alt",
    name: "Semana de Fogo",
    desc: "7 dias seguidos",
    xp: 150,
  },
  month_streak: {
    icon: "fa-crown",
    name: "Mês Imparável",
    desc: "30 dias seguidos",
    xp: 500,
  },

  // --- VOLUME (INTENSIDADE) ---
  marathon: {
    icon: "fa-running",
    name: "Maratonista",
    desc: "5 aulas em um único dia",
    xp: 100,
  },
  super_marathon: {
    icon: "fa-bolt",
    name: "Super Maratonista",
    desc: "10 aulas em um único dia",
    xp: 300,
  },
  centurion: {
    icon: "fa-medal",
    name: "Centurião",
    desc: "100 aulas assistidas no total",
    xp: 1000,
  },

  // --- TÉCNICOS ---
  artist: {
    icon: "fa-palette",
    name: "Artista Digital",
    desc: "Criou 5 desenhos",
    xp: 50,
  },
  pomodoro_master: {
    icon: "fa-stopwatch",
    name: "Mestre do Foco",
    desc: "5 sessões Pomodoro",
    xp: 150,
  },

  // --- HORÁRIO ---
  early_bird: {
    icon: "fa-sun",
    name: "Madrugador",
    desc: "Estudou antes das 8h",
    xp: 40,
  },
  night_owl: {
    icon: "fa-moon",
    name: "Coruja",
    desc: "Estudou depois das 23h",
    xp: 40,
  },
  weekend_warrior: {
    icon: "fa-calendar-week",
    name: "Guerreiro FDS",
    desc: "Estudou Sábado ou Domingo",
    xp: 60,
  },

  // --- CONCLUSÃO ---
  hour_focus: {
    icon: "fa-clock",
    name: "Hora de Foco",
    desc: "1 hora de estudo total",
    xp: 50,
  },
  finisher: {
    icon: "fa-flag-checkered",
    name: "Finalizador",
    desc: "Completou um curso 100%",
    xp: 500,
  },
};

let lastVideoTime = 0; // Para calcular o delta de tempo real

window.addEventListener("load", () => {
  const coursesData = localStorage.getItem("coursesData");
  const selectedFolder = localStorage.getItem("selectedFolder");

  renderCalendar();

  if (!coursesData || !selectedFolder) {
    window.location.href = "welcome.html";
    return;
  }

  const folderName = path.basename(selectedFolder);
  document.getElementById("courseTitle").innerText = folderName;

  currentCourses = JSON.parse(coursesData);
  displayCourses();

  // --- INICIALIZAÇÃO DO QUILL (EDITOR DE TEXTO) ---
  // Verifica se o elemento editor existe antes de criar (para evitar erros)
  if (document.getElementById("editor")) {
    quill = new Quill("#editor", {
      theme: "snow",
      placeholder: "Faça suas anotações aqui...",
      modules: {
        toolbar: [
          ["bold", "italic", "underline", "strike"],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ color: [] }, { background: [] }],
          ["clean"],
        ],
      },
    });

    // Evento de salvamento automático do Quill
    quill.on("text-change", function (delta, oldDelta, source) {
      if (source === "user") {
        const saveStatus = document.getElementById("saveStatus");
        saveStatus.innerText = "Digitando...";
        saveStatus.style.color = "#e1e1e6";

        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          const htmlContent = quill.root.innerHTML;
          await ipcRenderer.invoke("save-note", activeLessonPath, htmlContent);
          if (!userProfile.badges.includes("annotator"))
            unlockBadge("annotator");
          saveStatus.innerText = "Salvo ✓";
          saveStatus.style.color = "#04d361";
        }, 1000);
      }
    });
  }
});

// --- NAVEGAÇÃO E DROPDOWN ---
window.toggleSection = function (elementId, button) {
  const content = document.getElementById(elementId);
  if (content.style.display === "none") {
    content.style.display = "block";
    button.classList.add("active");
    const icon = button.querySelector(".arrow");
    if (icon) icon.className = "fas fa-chevron-up arrow";
  } else {
    content.style.display = "none";
    button.classList.remove("active");
    const icon = button.querySelector(".arrow");
    if (icon) icon.className = "fas fa-chevron-down arrow";
  }
};

window.prevLesson = function () {
  if (activeCourseIndex === null || activeLessonIndex === null) return;
  if (activeLessonIndex > 0) {
    loadContent(activeCourseIndex, activeLessonIndex - 1);
  }
};

window.nextLesson = function () {
  if (activeCourseIndex === null || activeLessonIndex === null) return;
  const course = currentCourses[activeCourseIndex];
  if (activeLessonIndex < course.lessons.length - 1) {
    loadContent(activeCourseIndex, activeLessonIndex + 1);
  }
};

// --- SIDEBAR ---
function displayCourses() {
  const courseList = document.getElementById("courseList");
  courseList.innerHTML = "";

  if (currentCourses.length === 0) {
    courseList.innerHTML = `<div class="empty-state"><p>Nenhum conteúdo</p></div>`;
    return;
  }

  currentCourses.forEach((course, courseIndex) => {
    const total = course.lessons.length;
    const watchedCount = course.lessons.filter((l) => l.watched).length;
    const percentage =
      total === 0 ? 0 : Math.round((watchedCount / total) * 100);
    const isOpen = courseIndex === activeCourseIndex;

    const courseElement = document.createElement("div");
    courseElement.className = `course-item ${isOpen ? "open" : ""}`;

    let html = `
      <div class="course-header" onclick="toggleModule(${courseIndex})">
        <div class="course-title">
          <i class="fas ${
            isOpen ? "fa-chevron-down" : "fa-chevron-right"
          }" style="font-size: 0.7rem; width: 10px;"></i>
          <span>${course.name}</span>
        </div>
        <span class="progress-text" style="font-size: 0.7rem;">${watchedCount}/${total}</span>
      </div>
      
      <div class="progress-container">
        <div class="progress-bar" style="width: ${percentage}%"></div>
      </div>
      <div class="lesson-container">
    `;

    // Links Extras
    if (course.externalLinks && course.externalLinks.length > 0) {
      course.externalLinks.forEach((link) => {
        const isUrl = link.url && link.url.startsWith("http");
        const clickAction = isUrl
          ? `ipcRenderer.invoke('open-external-url', '${link.url}')`
          : `ipcRenderer.invoke('open-file-external', '${link.path.replace(
              /\\/g,
              "\\\\"
            )}')`;

        const iconClass = isUrl ? "fa-external-link-alt" : "fa-file-code";
        const iconColor = isUrl ? "#61dafb" : "#e34c26";

        html += `
            <div class="sidebar-lesson link-item" onclick="${clickAction}">
                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                    <i class="fas ${iconClass}" style="font-size: 0.8rem; color: ${iconColor};"></i>
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${iconColor};">
                        ${link.name}
                    </span>
                </div>
            </div>`;
      });
      html += `<div style="height: 1px; background: rgba(255,255,255,0.05); margin: 4px 16px;"></div>`;
    }

    // Aulas
    course.lessons.forEach((lesson, lessonIndex) => {
      const isActive =
        courseIndex === activeCourseIndex && lessonIndex === activeLessonIndex;
      const icon = lesson.type === "video" ? "fa-play-circle" : "fa-file-alt";

      html += `
            <div class="sidebar-lesson ${isActive ? "active" : ""} ${
        lesson.watched ? "watched" : ""
      }" 
                 onclick="loadContent(${courseIndex}, ${lessonIndex})">
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1; min-width: 0;">
                    <i class="fas ${icon}" style="font-size: 0.8rem; flex-shrink: 0;"></i>
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${lesson.name}
                    </span>
                </div>
                <button class="sidebar-eye ${lesson.watched ? "watched" : ""}" 
                    onclick="event.stopPropagation(); toggleWatched(${courseIndex}, ${lessonIndex})"
                    title="Marcar como visto">
                    <i class="fas ${
                      lesson.watched ? "fa-eye-slash" : "fa-eye"
                    }"></i>
                </button>
            </div>
        `;
    });

    html += `</div>`;
    courseElement.innerHTML = html;
    courseList.appendChild(courseElement);
  });
}

function toggleModule(index) {
  if (activeCourseIndex === index) {
    activeCourseIndex = null;
  } else {
    activeCourseIndex = index;
  }
  displayCourses();
}

// --- CARREGAR CONTEÚDO (VÍDEO/TEXTO/NOTAS) ---
async function loadContent(courseIndex, lessonIndex) {
  const videoContainer = document.getElementById("videoContainer");
  const textContainer = document.getElementById("textContainer");
  const videoPlayer = document.getElementById("videoPlayer");
  const contentFrame = document.getElementById("contentFrame");
  const transcriptContainer = document.getElementById("transcriptContainer");
  const saveStatus = document.getElementById("saveStatus");

  activeCourseIndex = courseIndex;
  activeLessonIndex = lessonIndex;
  const lesson = currentCourses[courseIndex].lessons[lessonIndex];
  activeLessonPath = lesson.path;

  displayCourses();

  // -- CARREGAR NOTAS (Versão Quill) --
  if (saveStatus) saveStatus.innerText = "Carregando nota...";

  try {
    const savedNote = await ipcRenderer.invoke("get-note", lesson.path);
    if (quill) {
      // Define o conteúdo HTML do editor
      quill.root.innerHTML = savedNote || "";
      // Limpa o histórico de undo/redo ao carregar nova nota
      quill.history.clear();
    }
    if (saveStatus) saveStatus.innerText = "Pronto";
  } catch (err) {
    console.error("Erro ao carregar nota:", err);
  }

  // -- CARREGAR MÍDIA --
  try {
    const fileUrl = await ipcRenderer.invoke("get-video-url", lesson.path);

    if (lesson.type === "video") {
      // MODO VÍDEO
      textContainer.style.display = "none";
      videoContainer.style.display = "block";

      // Reset visual
      document.getElementById("playerWrapper").classList.add("paused");
      document.getElementById("playPauseBtn").innerHTML =
        '<i class="fas fa-play"></i>';
      document.getElementById("speedDropdown").classList.remove("show");

      videoPlayer.src = fileUrl;
      videoPlayer.innerHTML = ""; // Limpa tracks antigos

      lastVideoTime = 0;

      // Recupera tempo salvo
      const savedTime = localStorage.getItem(`time_${lesson.path}`);
      if (savedTime) videoPlayer.currentTime = parseFloat(savedTime);

      // --- EVENTOS DO NOVO PLAYER ---
      videoPlayer.onloadedmetadata = () => {
        // Atualiza duração total (ex: 10:00)
        document.getElementById("duration").innerText = formatSeconds(
          videoPlayer.duration
        );
      };

      // Substitua o bloco videoPlayer.ontimeupdate inteiro por este:

      videoPlayer.ontimeupdate = () => {
        const currentTime = videoPlayer.currentTime;

        // --- NOVO: RASTREADOR DE TEMPO REAL (TRACKER) ---
        // A lógica: se o vídeo avançou E a diferença é menor que 1s (significa que assistiu, não pulou)
        if (currentTime > lastVideoTime && currentTime - lastVideoTime < 1) {
          const diff = currentTime - lastVideoTime;

          // Adiciona ao total do perfil
          userProfile.totalWatchTime += diff;

          // Otimização: Salva o perfil e checa conquistas a cada ~10 segundos acumulados
          // (Para não salvar no disco 60 vezes por segundo)
          if (Math.floor(userProfile.totalWatchTime) % 10 === 0) {
            saveProfile();
            checkAchievements(); // Verifica se ganhou badge de "Hora de Foco"
            updateGamificationUI(); // Atualiza os números na tela
          }
        }
        lastVideoTime = currentTime;
        // ---------------------------------------------------

        // 1. Salva localStorage (Mantido)
        localStorage.setItem(`time_${lesson.path}`, videoPlayer.currentTime);

        // 2. Atualiza barra de progresso visual (Mantido)
        const percent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
        document.getElementById("progressBar").value = percent;
        document.getElementById(
          "progressBar"
        ).style.background = `linear-gradient(to right, var(--success) ${percent}%, rgba(255,255,255,0.3) ${percent}%)`;

        // 3. Atualiza texto de tempo (Mantido)
        document.getElementById("currentTime").innerText = formatSeconds(
          videoPlayer.currentTime
        );

        // 4. Sincroniza Legenda (Mantido)
        highlightTranscript(videoPlayer.currentTime);
      };

      videoPlayer.onended = () => {
        document.getElementById("playPauseBtn").innerHTML =
          '<i class="fas fa-redo"></i>';
        document.getElementById("playerWrapper").classList.add("paused");
        // Opcional: Auto-play próxima aula
        // nextLesson();
      };

      // Carrega Legenda e Transcrição
      if (lesson.subtitle) {
        const subtitleUrl = await ipcRenderer.invoke(
          "get-video-url",
          lesson.subtitle
        );

        // Cria a track para o player (CC nativo)
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = "Português";
        track.srclang = "pt";
        track.src = subtitleUrl;
        track.default = true;
        videoPlayer.appendChild(track);

        // Gera a transcrição clicável e sincronizada
        loadTranscriptText(subtitleUrl);
        transcriptContainer.style.display = "block";

        // Reseta botão de legenda se existir
        const btnCaptions = document.getElementById("btnCaptions");
        if (btnCaptions) {
          btnCaptions.classList.add("active"); // Assume ligado por padrão pq track.default = true
          btnCaptions.style.color = "var(--success)";
        }
      } else {
        transcriptContainer.style.display = "none";
      }

      videoPlayer.load();
    } else {
      // MODO TEXTO (HTML)
      videoContainer.style.display = "none";
      textContainer.style.display = "flex";
      videoPlayer.pause();
      contentFrame.src = fileUrl;
    }
  } catch (error) {
    console.error("Erro ao carregar conteúdo", error);
    alert("Erro ao abrir arquivo.");
  }
}

// --- LÓGICA DE TRANSCRIÇÃO INTELIGENTE ---
async function loadTranscriptText(subtitleUrl) {
  const container = document.getElementById("transcriptText");
  container.innerHTML = "Carregando...";
  transcriptSegments = []; // Limpa cache de tempos

  try {
    const response = await fetch(subtitleUrl);
    const text = await response.text();

    // Parse manual do VTT
    const lines = text.split("\n");
    let html = "";
    let currentStart = null;
    let currentEnd = null;
    let currentText = [];

    lines.forEach((line) => {
      line = line.trim();
      if (line.includes("-->")) {
        // Salva bloco anterior
        if (currentStart !== null && currentText.length > 0) {
          addSegment(currentStart, currentEnd, currentText.join(" "));
        }
        // Novos tempos
        const parts = line.split("-->");
        currentStart = timeToSeconds(parts[0].trim());
        currentEnd = timeToSeconds(parts[1].trim());
        currentText = [];
      } else if (
        line !== "" &&
        !line.startsWith("WEBVTT") &&
        !line.startsWith("NOTE") &&
        isNaN(line)
      ) {
        // Texto da legenda
        currentText.push(line);
      }
    });

    // Salva último bloco
    if (currentStart !== null && currentText.length > 0) {
      addSegment(currentStart, currentEnd, currentText.join(" "));
    }

    function addSegment(start, end, txt) {
      html += `<span class="transcript-line" data-start="${start}" data-end="${end}" onclick="seekTo(${start})">${txt}</span> `;
      transcriptSegments.push({ start, end });
    }

    container.innerHTML = html;
  } catch (e) {
    container.innerText = "Erro ao carregar transcrição.";
  }
}

// Converte "00:01:30.500" para segundos
function timeToSeconds(timeString) {
  if (!timeString) return 0;
  const parts = timeString.split(":");
  let seconds = 0;
  if (parts.length === 3) {
    seconds =
      parseFloat(parts[0]) * 3600 +
      parseFloat(parts[1]) * 60 +
      parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return seconds;
}

// Pula vídeo para o tempo clicado
window.seekTo = function (seconds) {
  const video = document.getElementById("videoPlayer");
  if (video) {
    video.currentTime = seconds;
    video.play();
  }
};

// Destaca texto conforme o vídeo toca
function highlightTranscript(currentTime) {
  // Busca todas as linhas (caso não tenhamos cacheado os elementos DOM, fazemos querySelector)
  // Para performance em arquivos gigantes, ideal seria cachear, mas aqui funciona bem.
  const lines = document.querySelectorAll(".transcript-line");

  // Otimização: Só roda se o container estiver visível
  const container = document.getElementById("transcriptContainer");
  if (container.style.display === "none") return;

  lines.forEach((line) => {
    const start = parseFloat(line.getAttribute("data-start"));
    const end = parseFloat(line.getAttribute("data-end"));

    if (currentTime >= start && currentTime <= end) {
      if (!line.classList.contains("active")) {
        // Remove anterior
        const active = document.querySelector(".transcript-line.active");
        if (active) active.classList.remove("active");

        // Adiciona novo
        line.classList.add("active");

        // Scroll automático suave
        line.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  });
}

// --- BOTÃO DE LIGAR/DESLIGAR LEGENDA ---
window.toggleCaptions = function () {
  const video = document.getElementById("videoPlayer");
  const btn = document.getElementById("btnCaptions");

  if (!video.textTracks || video.textTracks.length === 0) {
    alert("Nenhuma legenda disponível.");
    return;
  }

  const track = video.textTracks[0];

  if (track.mode === "showing") {
    track.mode = "hidden";
    if (btn) {
      btn.classList.remove("active");
      btn.style.color = "var(--text-secondary)";
    }
  } else {
    track.mode = "showing";
    if (btn) {
      btn.classList.add("active");
      btn.style.color = "var(--success)";
    }
  }
};

// --- FUNÇÕES GERAIS ---

// Substitua a função toggleWatched inteira por esta:

async function toggleWatched(courseIndex, lessonIndex) {
  const lesson = currentCourses[courseIndex].lessons[lessonIndex];
  lesson.watched = !lesson.watched;

  if (lesson.watched) {
    // 1. Ganha XP
    addXP(50, "Aula Concluída");

    // 2. Registra no Histórico Diário (para Maratonista)
    const today = new Date().toISOString().split("T")[0];
    userProfile.dailyHistory[today] =
      (userProfile.dailyHistory[today] || 0) + 1;

    // 3. Salva no Checklist do Calendário (para Streak)
    if (!studyChecklist[today]) {
      studyChecklist[today] = true;
      localStorage.setItem("studyChecklist", JSON.stringify(studyChecklist));
    }

    checkAchievements();
  }
  // ----------------------------------

  await ipcRenderer.invoke("toggle-watched", lesson.path, lesson.watched);
  localStorage.setItem("coursesData", JSON.stringify(currentCourses));

  displayCourses(); // Atualiza a sidebar da esquerda
  updateGamificationUI(); // Atualiza a sidebar da direita (barra de XP)
}

function toggleSidebar() {
  const sidebar = document.querySelector(".sidebar");
  sidebar.classList.toggle("collapsed");
}

function toggleNotesSidebar() {
  const notesSidebar = document.querySelector(".notes-sidebar");
  notesSidebar.classList.toggle("collapsed");
}

function changeSpeed(select) {
  const video = document.getElementById("videoPlayer");
  if (video) video.playbackRate = parseFloat(select.value);
}

// Atalhos de Teclado
document.addEventListener("keydown", (e) => {
  const videoPlayer = document.getElementById("videoPlayer");

  // Ignora se estiver digitando no Quill ou Input
  if (
    document.querySelector(".ql-editor") &&
    document.querySelector(".ql-editor").contains(document.activeElement)
  )
    return;
  if (document.activeElement.tagName === "INPUT") return;

  if (document.getElementById("videoContainer").style.display === "none")
    return;

  switch (e.code) {
    case "Space":
      e.preventDefault();
      if (videoPlayer.paused) videoPlayer.play();
      else videoPlayer.pause();
      break;
    case "ArrowRight":
      videoPlayer.currentTime += 5;
      break;
    case "ArrowLeft":
      videoPlayer.currentTime -= 5;
      break;
  }

  // Atalho T para Theater Mode
  if (e.key.toLowerCase() === "t") {
    toggleTheaterMode();
  }
});

function filterLessons(searchTerm) {
  const term = searchTerm.toLowerCase();
  const courses = document.querySelectorAll(".course-item");
  courses.forEach((course) => {
    const titleSpan = course.querySelector(".course-title span");
    if (titleSpan) {
      const title = titleSpan.innerText.toLowerCase();
      if (title.includes(term)) {
        course.style.display = "flex";
      } else {
        course.style.display = "none";
      }
    }
  });
}

function toggleTheaterMode() {
  document.body.classList.toggle("theater-active");
}

// --- POMODORO AUTOMÁTICO COM SOM ---
let pomoInterval = null;
let isPomoRunning = false;
let currentMode = "work";
let timeRemaining = 25 * 60;

// Correto: Inicializando imediatamente
const bellSound = new Audio("./assets/pop.mp3");
// ou apenas 'assets/pop.mp3'

bellSound.volume = 0.5; // Definir volume (0.0 a 1.0)

function updatePomoDisplay() {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  const minInputId = currentMode === "work" ? "workMin" : "breakMin";
  const secSpanId = currentMode === "work" ? "workSec" : "breakSec";

  const minInput = document.getElementById(minInputId);
  const secSpan = document.getElementById(secSpanId);

  if (minInput && secSpan) {
    if (document.activeElement !== minInput) {
      minInput.value = minutes;
    }
    secSpan.innerText = seconds.toString().padStart(2, "0");
  }

  if (isPomoRunning) {
    const icon = currentMode === "work" ? "Foco" : "Pausa";
    document.title = `(${minutes}:${seconds
      .toString()
      .padStart(2, "0")}) ${icon} - Course Deck`;
  } else {
    document.title = "Course Deck";
  }
}

function updatePomoSettings() {
  // Se estiver rodando, não atualiza o tempo restante para não resetar o timer
  if (isPomoRunning) return;

  let workInput = document.getElementById("workMin");
  let breakInput = document.getElementById("breakMin");

  let workVal = parseInt(workInput.value);
  if (isNaN(workVal) || workVal < 1) {
    workVal = 1;
    workInput.value = 1;
  }

  let breakVal = parseInt(breakInput.value);
  if (isNaN(breakVal) || breakVal < 1) {
    breakVal = 1;
    breakInput.value = 1;
  }

  if (currentMode === "work") {
    timeRemaining = workVal * 60;
    document.getElementById("workSec").innerText = "00";
  } else {
    timeRemaining = breakVal * 60;
    document.getElementById("breakSec").innerText = "00";
  }
}

function setPomoMode(mode) {
  // Se clicar manualmente, queremos parar.
  // Mas se for automático (loop), o togglePomodoro cuida disso.
  if (isPomoRunning && mode !== currentMode) {
    // Se o usuário clicou para mudar o modo manualmente enquanto roda, pausamos.
    clearInterval(pomoInterval);
    isPomoRunning = false;
    document.querySelector("#pomoBtn i").className = "fas fa-play";
    document.getElementById("workMin").disabled = false;
    document.getElementById("breakMin").disabled = false;
  }

  currentMode = mode;

  document.getElementById("pomoWork").className =
    mode === "work" ? "timer-text active" : "timer-text";
  document.getElementById("pomoBreak").className =
    mode === "break" ? "timer-text active" : "timer-text";

  updatePomoSettings();
}

function togglePomodoro() {
  const btnIcon = document.querySelector("#pomoBtn i");
  const minInput = document.getElementById("workMin");
  const breakInput = document.getElementById("breakMin");

  if (isPomoRunning) {
    // PAUSAR
    clearInterval(pomoInterval);
    isPomoRunning = false;
    btnIcon.className = "fas fa-play";
    minInput.disabled = false;
    breakInput.disabled = false;
    document.title = "Course Deck";
  } else {
    // INICIAR
    isPomoRunning = true;
    btnIcon.className = "fas fa-pause";
    minInput.disabled = true;
    breakInput.disabled = true;

    pomoInterval = setInterval(() => {
      if (timeRemaining > 0) {
        timeRemaining--;
        updatePomoDisplay();
      } else {
        // --- O TEMPO ACABOU ---

        // 1. Toca o Som
        bellSound.play().catch((e) => console.log("Erro som:", e));

        // 2. Troca o Modo e Dá XP (NOVO)
        if (currentMode === "work") {
          // Ganha XP
          addXP(25, "Pomodoro Completo");

          // --- CORREÇÃO: Contagem para Badge ---
          // Incrementa contador de sessões
          userProfile.pomoSessions = (userProfile.pomoSessions || 0) + 1;
          saveProfile(); // Salva o novo contador

          // Verifica se completou 5 sessões para a Badge
          if (userProfile.pomoSessions >= 5) {
            unlockBadge("pomodoro_master");
          }
          // ------------------------------------

          currentMode = "break";
        } else {
          currentMode = "work";
        }

        // 3. Atualiza Visual (Classes CSS)
        document.getElementById("pomoWork").className =
          currentMode === "work" ? "timer-text active" : "timer-text";
        document.getElementById("pomoBreak").className =
          currentMode === "break" ? "timer-text active" : "timer-text";

        // 4. Reseta o tempo para o novo modo
        // Lemos os inputs diretamente para garantir o tempo certo
        let workVal = parseInt(document.getElementById("workMin").value) || 25;
        let breakVal = parseInt(document.getElementById("breakMin").value) || 5;

        timeRemaining = (currentMode === "work" ? workVal : breakVal) * 60;

        // 5. O setInterval continua rodando...
      }
    }, 1000);
  }
}

function resetPomodoro() {
  clearInterval(pomoInterval);
  isPomoRunning = false;
  document.querySelector("#pomoBtn i").className = "fas fa-play";
  document.getElementById("workMin").disabled = false;
  document.getElementById("breakMin").disabled = false;

  // Volta sempre para o modo Trabalho ao resetar
  currentMode = "work";
  document.getElementById("pomoWork").className = "timer-text active";
  document.getElementById("pomoBreak").className = "timer-text";

  updatePomoSettings();
  updatePomoDisplay();
  document.title = "Course Deck";
}

// --- REDIMENSIONAMENTO DA SIDEBAR (ESQUERDA) ---
const sidebar = document.querySelector(".sidebar");
const resizer = document.getElementById("resizer");
let isResizing = false;

if (resizer) {
  resizer.addEventListener("mousedown", (e) => {
    isResizing = true;
    document.body.style.cursor = "col-resize";
    document.body.classList.add("resizing-active"); // Ajuda com o problema do iframe
    resizer.classList.add("resizing");

    // DESLIGA a animação para ficar fluido
    sidebar.classList.add("no-transition");
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    e.preventDefault();
    let newWidth = e.clientX;
    if (newWidth < 200) newWidth = 200;
    if (newWidth > 600) newWidth = 600;
    sidebar.style.width = `${newWidth}px`;
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = "default";
      document.body.classList.remove("resizing-active");
      resizer.classList.remove("resizing");

      // LIGA a animação de volta (para o botão de fechar funcionar suave)
      sidebar.classList.remove("no-transition");
    }
  });
}

// --- REDIMENSIONADOR DIREITO (NOTAS) ---
const notesSidebar = document.querySelector(".notes-sidebar");
const resizerRight = document.getElementById("resizer-right");
let isResizingRight = false;

if (resizerRight) {
  resizerRight.addEventListener("mousedown", (e) => {
    isResizingRight = true;
    document.body.style.cursor = "col-resize";
    document.body.classList.add("resizing-active");
    resizerRight.classList.add("resizing");

    // DESLIGA a animação
    notesSidebar.classList.add("no-transition");
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizingRight) return;
    e.preventDefault();

    let newWidth = window.innerWidth - e.clientX;

    if (newWidth < 250) newWidth = 250;
    if (newWidth > 800) newWidth = 800;

    notesSidebar.style.width = `${newWidth}px`;
  });

  document.addEventListener("mouseup", () => {
    if (isResizingRight) {
      isResizingRight = false;
      document.body.style.cursor = "default";
      document.body.classList.remove("resizing-active");
      resizerRight.classList.remove("resizing");

      // LIGA a animação de volta
      notesSidebar.classList.remove("no-transition");
    }
  });
}

// --- SISTEMA DE DESENHO (CANVAS) ---
const modal = document.getElementById("drawingModal");
const canvas = document.getElementById("drawingCanvas");
let ctx;
let isDrawing = false;
let currentColor = "#ffffff"; // Cor atual

// Variáveis de Histórico (Undo)
let drawingHistory = [];
let historyStep = -1;

function setupCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  ctx = canvas.getContext("2d");

  // Configuração inicial
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Reseta histórico ao abrir
  drawingHistory = [];
  historyStep = -1;
  saveHistory(); // Salva o estado em branco inicial

  // Reseta para pincel (caso tenha fechado com borracha)
  useBrush();
}

// --- FUNÇÕES DE PINCEL E BORRACHA ---

// Ativa modo Pincel (Chamado ao escolher cor)
window.setColor = function (color, element) {
  currentColor = color;
  useBrush(); // Garante que saiu do modo borracha

  // Atualiza visual da bolinha
  document
    .querySelectorAll(".color-swatch")
    .forEach((el) => el.classList.remove("active"));
  if (element) element.classList.add("active");
};

// Função interna para configurar o pincel normal
function useBrush() {
  if (!ctx) return;
  ctx.globalCompositeOperation = "source-over"; // Modo desenho normal
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = 2;

  // Remove destaque do botão borracha
  const btnEraser = document.getElementById("btnEraser");
  if (btnEraser) btnEraser.classList.remove("active-tool");
}

// Ativa modo Borracha
window.toggleEraser = function (btnElement) {
  if (!ctx) return;
  ctx.globalCompositeOperation = "destination-out"; // Modo "Apagar" (deixa transparente)
  ctx.lineWidth = 15; // Borracha mais grossa que o pincel

  // Tira seleção das cores
  document
    .querySelectorAll(".color-swatch")
    .forEach((el) => el.classList.remove("active"));

  // Destaca botão da borracha
  if (btnElement) btnElement.classList.add("active-tool");
};

// --- SISTEMA DE HISTÓRICO (UNDO) ---

function saveHistory() {
  historyStep++;
  // Se desenhou algo depois de dar undo, apaga o futuro (timeline alternativa)
  if (historyStep < drawingHistory.length) {
    drawingHistory.length = historyStep;
  }
  drawingHistory.push(canvas.toDataURL());
}

window.undoLastStroke = function () {
  if (historyStep > 0) {
    historyStep--;
    const canvasPic = new Image();
    canvasPic.src = drawingHistory[historyStep];
    canvasPic.onload = function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Importante: desenhar a imagem salva com o modo 'source-over' para não bugar a borracha
      let previousMode = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(canvasPic, 0, 0);
      ctx.globalCompositeOperation = previousMode; // Restaura modo (borracha ou pincel)
    };
  }
};

// --- JANELA MODAL ---

window.openDrawingModal = function () {
  modal.style.display = "flex";
  setTimeout(setupCanvas, 50);
};

window.closeDrawingModal = function () {
  modal.style.display = "none";
};

window.clearCanvas = function () {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  saveHistory(); // Salva o estado limpo
};

// --- EVENTOS DO MOUSE ---

canvas.addEventListener("mousedown", (e) => {
  isDrawing = true;
  ctx.beginPath();
  ctx.moveTo(e.offsetX, e.offsetY);
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.stroke();
});

canvas.addEventListener("mouseup", () => {
  if (isDrawing) {
    isDrawing = false;
    saveHistory(); // <--- SALVA O TRAÇO ASSIM QUE SOLTA O MOUSE
  }
});

canvas.addEventListener("mouseout", () => {
  if (isDrawing) {
    isDrawing = false;
    saveHistory();
  }
});

// --- ATALHO DE TECLADO (CTRL + Z) ---
document.addEventListener("keydown", (e) => {
  // Só funciona se o modal estiver aberto
  if (modal.style.display === "flex") {
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      window.undoLastStroke();
    }
  }
});

// --- INSERIR NO QUILL (MANTIDO) ---
window.insertDrawing = function () {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tCtx = tempCanvas.getContext("2d");

  tCtx.drawImage(canvas, 0, 0);
  const dataURL = tempCanvas.toDataURL("image/png");

  if (quill) {
    const range = quill.getSelection(true);
    let index = range ? range.index : quill.getLength();

    quill.insertEmbed(index, "image", dataURL);
    quill.insertText(index + 1, "\n");
    quill.setSelection(index + 2);

    userProfile.canvasDrawings = (userProfile.canvasDrawings || 0) + 1;
    saveProfile();
    checkAchievements();
  }

  closeDrawingModal();
};

// ==========================================
// CONTROLES DO PLAYER CUSTOMIZADO
// ==========================================

function togglePlay() {
  const video = document.getElementById("videoPlayer");
  const btn = document.getElementById("playPauseBtn");
  const wrapper = document.getElementById("playerWrapper");
  const centerIcon = wrapper.querySelector(".center-play-btn i");

  if (video.paused) {
    video.play();
    btn.innerHTML = '<i class="fas fa-pause"></i>';
    centerIcon.className = "fas fa-pause"; // Troca ícone central momentaneamente
    wrapper.classList.remove("paused");

    // Animação rápida do ícone central sumindo
    setTimeout(() => {
      // O CSS cuida da opacidade, mas podemos garantir estados aqui se precisar
    }, 200);
  } else {
    video.pause();
    btn.innerHTML = '<i class="fas fa-play"></i>';
    centerIcon.className = "fas fa-play";
    wrapper.classList.add("paused");
  }
}

function seekVideo(percent) {
  const video = document.getElementById("videoPlayer");
  const time = (percent / 100) * video.duration;
  video.currentTime = time;
}

function setVolume(value) {
  const video = document.getElementById("videoPlayer");
  video.volume = value;

  // Ícone muda conforme volume
  const btn = document.getElementById("muteBtn");
  if (value == 0) btn.innerHTML = '<i class="fas fa-volume-mute"></i>';
  else if (value < 0.5) btn.innerHTML = '<i class="fas fa-volume-down"></i>';
  else btn.innerHTML = '<i class="fas fa-volume-up"></i>';
}

function toggleMute() {
  const video = document.getElementById("videoPlayer");
  const volBar = document.getElementById("volumeBar");

  if (video.volume > 0) {
    video.dataset.lastVolume = video.volume; // Salva volume anterior
    video.volume = 0;
    volBar.value = 0;
    setVolume(0);
  } else {
    const last = video.dataset.lastVolume || 1;
    video.volume = last;
    volBar.value = last;
    setVolume(last);
  }
}

// Menu de Velocidade
function toggleSpeedMenu() {
  document.getElementById("speedDropdown").classList.toggle("show");
}
function setSpeed(rate) {
  const video = document.getElementById("videoPlayer");
  video.playbackRate = rate;

  // Atualiza texto do botão
  document.getElementById("speedBtn").innerText = rate + "x";

  // Atualiza classe active no menu
  const options = document.querySelectorAll(".speed-dropdown div");
  options.forEach((div) => {
    if (div.innerText.includes(rate)) div.classList.add("active");
    else div.classList.remove("active");
  });

  toggleSpeedMenu(); // Fecha menu
}

// Tela Cheia
function toggleFullscreen() {
  const wrapper = document.getElementById("playerWrapper");
  if (!document.fullscreenElement) {
    wrapper.requestFullscreen().catch((err) => {
      alert(`Erro ao entrar em tela cheia: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

// Formatação de Tempo (segundos -> mm:ss)
function formatSeconds(s) {
  if (isNaN(s)) return "0:00";
  const minutes = Math.floor(s / 60);
  const seconds = Math.floor(s % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Fecha o menu de velocidade se clicar fora
document.addEventListener("click", (e) => {
  const isClickInside = e.target.closest(".speed-menu-container");
  if (!isClickInside) {
    document.getElementById("speedDropdown").classList.remove("show");
  }
});

function switchTab(tabName) {
  // 1. Atualiza botões
  document
    .querySelectorAll(".tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`tab-btn-${tabName}`).classList.add("active");

  // 2. Atualiza visualização
  document
    .querySelectorAll(".tab-view")
    .forEach((view) => view.classList.remove("active-view"));
  document.getElementById(`view-${tabName}`).classList.add("active-view");

  // 3. Renderiza dados frescos
  if (tabName === "calendar") renderCalendar();

  // --- CORREÇÃO AQUI ---
  if (tabName === "stats") {
    updateGamificationUI(); // Chama a função nova de XP/Badges
  }
  if (tabName === "achievements") renderAchievementsTab();
}

// --- CALENDÁRIO ---
function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  document.getElementById(
    "calMonthName"
  ).innerText = `${monthNames[month]} ${year}`;

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Dias vazios
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "day-box empty";
    grid.appendChild(empty);
  }

  // Dias reais
  const todayStr = new Date().toISOString().split("T")[0];

  for (let day = 1; day <= daysInMonth; day++) {
    // Formato YYYY-MM-DD
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const el = document.createElement("div");
    el.className = "day-box";
    el.innerText = day;

    if (dateStr === todayStr) el.classList.add("today");
    if (studyChecklist[dateStr]) el.classList.add("checked");

    el.onclick = () => toggleStudyDay(dateStr, el);
    grid.appendChild(el);
  }

  updateStreak();
}

function changeMonth(dir) {
  currentDate.setMonth(currentDate.getMonth() + dir);
  renderCalendar();
}

function toggleStudyDay(dateStr, element) {
  if (studyChecklist[dateStr]) {
    delete studyChecklist[dateStr];
    element.classList.remove("checked");
  } else {
    studyChecklist[dateStr] = true;
    element.classList.add("checked");
  }
  localStorage.setItem("studyChecklist", JSON.stringify(studyChecklist));
  updateStreak();
}

function updateStreak() {
  let streak = 0;
  let d = new Date();
  // Verifica de ontem para trás (ou hoje se já marcou)
  const todayStr = d.toISOString().split("T")[0];
  if (!studyChecklist[todayStr]) d.setDate(d.getDate() - 1);

  while (true) {
    const dateStr = d.toISOString().split("T")[0];
    if (studyChecklist[dateStr]) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  const streakEl = document.getElementById("streakCount");
  if (streakEl) streakEl.innerText = streak;
}

// --- ESTATÍSTICAS MELHORADAS ---

// ==========================================
// MOTOR DE GAMIFICATION
// ==========================================

function addXP(amount, reason) {
  const oldLevel = getRank(userProfile.xp).name;
  userProfile.xp += amount;

  // Log de XP (Mantém apenas os últimos 20)
  userProfile.xpLog.unshift({ reason, amount, date: new Date().toISOString() });
  if (userProfile.xpLog.length > 20) userProfile.xpLog.pop();

  const newRank = getRank(userProfile.xp);
  saveProfile();
  showToast(`+${amount} XP`, reason);

  if (newRank.name !== oldLevel) {
    showToast("LEVEL UP!", `Rank: ${newRank.name}`, "achievement");
  }
  updateGamificationUI();
}

function unlockBadge(badgeId) {
  if (!userProfile.badges.includes(badgeId)) {
    userProfile.badges.push(badgeId);
    const badge = BADGES[badgeId];

    // Ganha XP da badge
    addXP(badge.xp, `Conquista: ${badge.name}`);

    showToast(badge.name, "Nova conquista desbloqueada!", "achievement");
    saveProfile();
    updateGamificationUI();
  }
}

function getRank(xp) {
  // Encontra o rank atual baseado no XP
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].minXP) return RANKS[i];
  }
  return RANKS[0];
}

function saveProfile() {
  localStorage.setItem("userProfile", JSON.stringify(userProfile)); // Backup
  ipcRenderer.invoke("save-profile", userProfile); // Salvamento Real
}

// Verifica conquistas automaticamente
function checkAchievements() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const todayStr = now.toISOString().split("T")[0];

  // 1. Dados Básicos
  let watchedTotal = 0;
  let completedCourses = 0;

  if (currentCourses) {
    currentCourses.forEach((c) => {
      const done = c.lessons.filter((l) => l.watched).length;
      watchedTotal += done;
      if (done === c.lessons.length && c.lessons.length > 0) completedCourses++;
    });
  }

  // 2. Calcula Streak Atual
  let currentStreak = 0;
  let d = new Date();
  if (!studyChecklist[todayStr]) d.setDate(d.getDate() - 1); // Se não estudou hoje, checa de ontem
  while (studyChecklist[d.toISOString().split("T")[0]]) {
    currentStreak++;
    d.setDate(d.getDate() - 1);
  }

  // Atualiza recorde
  if (currentStreak > (userProfile.streakRecord || 0)) {
    userProfile.streakRecord = currentStreak;
  }

  // 3. Aulas Hoje (Maratonista)
  const lessonsToday = userProfile.dailyHistory[todayStr] || 0;

  // --- VERIFICAÇÕES ---

  // Tempo
  if (userProfile.totalWatchTime >= 3600) unlockBadge("hour_focus");

  // Horário
  if (hour < 8 && hour >= 4) unlockBadge("early_bird");
  if (hour >= 23 || hour < 3) unlockBadge("night_owl");
  if (day === 0 || day === 6) unlockBadge("weekend_warrior");

  // Volume Total
  if (watchedTotal >= 1) unlockBadge("first_lesson");
  if (watchedTotal >= 100) unlockBadge("centurion");

  // Volume Diário
  if (lessonsToday >= 5) unlockBadge("marathon");
  if (lessonsToday >= 10) unlockBadge("super_marathon");

  // Streak
  if (currentStreak >= 3) unlockBadge("dedicated");
  if (currentStreak >= 7) unlockBadge("week_streak");
  if (currentStreak >= 30) unlockBadge("month_streak");

  // Conclusão
  if (completedCourses >= 1) unlockBadge("finisher");

  // Criativo
  if (userProfile.canvasDrawings >= 5) unlockBadge("artist");

  saveProfile();
}

function updateGamificationUI() {
  const currentRank = getRank(userProfile.xp);
  const nextRankIndex = RANKS.indexOf(currentRank) + 1;
  const nextRank = RANKS[nextRankIndex] || {
    minXP: userProfile.xp * 1.5,
    name: "Max",
  };

  document.getElementById("rankBadge").innerText = currentRank.name;
  document.getElementById("currentXP").innerText = userProfile.xp;
  document.getElementById("nextRank").innerText = nextRank.name;

  const range = nextRank.minXP - currentRank.minXP;
  const progress = userProfile.xp - currentRank.minXP;
  const percent = Math.min(100, Math.max(0, (progress / range) * 100));
  document.getElementById("xpBarFill").style.width = `${percent}%`;

  document.getElementById("statRealTime").innerText =
    (userProfile.totalWatchTime / 3600).toFixed(1) + "h";

  let watchedTotal = 0;
  if (currentCourses)
    currentCourses.forEach(
      (c) => (watchedTotal += c.lessons.filter((l) => l.watched).length)
    );
  document.getElementById("statCompleted").innerText = watchedTotal;

  // --- STREAK ALINHADO (Visual Limpo Vertical) ---
  const streakEl = document.getElementById("streakCount");
  const record = userProfile.streakRecord || 0;
  const statStreakDiv = document.getElementById("statStreak");

  if (streakEl && statStreakDiv) {
    statStreakDiv.style.display = "flex";
    statStreakDiv.style.flexDirection = "column";
    statStreakDiv.style.alignItems = "center";
    statStreakDiv.style.lineHeight = "1.2";

    statStreakDiv.innerHTML = `
        <span style="font-size: 1.5rem; margin-bottom: -2px;">${streakEl.innerText}</span>
        <span style="font-size: 0.6rem; color: #fbbf24; white-space: nowrap;">Rec: ${record}</span>
    `;
  }

  // --- LOG DE XP (Últimas Atividades) ---
  const logContainer = document.getElementById("xpLogList");
  if (logContainer && userProfile.xpLog) {
    logContainer.innerHTML = userProfile.xpLog
      .slice(0, 5)
      .map((log) => {
        let timeStr = "";
        if (log.date) {
          const d = new Date(log.date);
          timeStr = d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        }
        return `<div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; flex-direction:column;">
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px;">${log.reason}</span>
                <span style="font-size:0.65rem; opacity:0.5">${timeStr}</span>
            </div>
            <span style="color:var(--success); font-size:0.8rem;">+${log.amount}</span>
         </div>`;
      })
      .join("");
  }

  // Renderiza o gráfico da semana
  renderWeeklyChart();
}

// Sistema de Notificação (Toast)
function showToast(title, message, type = "normal") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let icon = type === "achievement" ? "fa-trophy" : "fa-info-circle";

  toast.innerHTML = `
        <i class="fas ${icon}" style="font-size: 1.2rem; color: ${
    type === "achievement" ? "#fbbf24" : "var(--success)"
  }"></i>
        <div class="toast-content">
            <strong>${title}</strong>
            <span>${message}</span>
        </div>
    `;

  container.appendChild(toast);

  // Remove depois de 4 segundos
  setTimeout(() => {
    toast.style.animation = "fadeOutToast 0.5s forwards";
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

function renderWeeklyChart() {
  const container = document.getElementById("weeklyChart");
  if (!container) return;
  container.innerHTML = "";

  const dayLabels = ["D", "S", "T", "Q", "Q", "S", "S"];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayIndex = d.getDay();

    // Verifica se estudou nesse dia (pelo checklist do calendário)
    const didStudy = studyChecklist[dateStr];

    // Altura da barra: 70% se estudou, 10% se não (placeholder visual)
    const heightPercent = didStudy ? 70 : 10;
    const isToday = i === 0;

    const col = document.createElement("div");
    col.className = `chart-column ${isToday ? "today" : ""}`;
    col.innerHTML = `
        <div class="bar-visual" style="height: ${heightPercent}%;" title="${dateStr}"></div>
        <span class="day-label">${dayLabels[dayIndex]}</span>
    `;
    container.appendChild(col);
  }
}

function renderAchievementsTab() {
  const list = document.getElementById("achievementsList");
  const countEl = document.getElementById("badgeCount");
  if (!list) return;

  list.innerHTML = "";

  const totalBadges = Object.keys(BADGES).length;
  const unlockedBadges = userProfile.badges.length;
  countEl.innerText = `${unlockedBadges}/${totalBadges}`;

  Object.keys(BADGES).forEach((key) => {
    const badge = BADGES[key];
    const isUnlocked = userProfile.badges.includes(key);

    const card = document.createElement("div");
    card.className = `achievement-card ${isUnlocked ? "unlocked" : ""}`;

    // Tenta achar a data de desbloqueio (se salvarmos isso futuramente no userProfile.badges como objeto)
    // Por enquanto, mostra XP ou Status

    card.innerHTML = `
        <div class="ach-icon"><i class="fas ${badge.icon}"></i></div>
        <div class="ach-info">
            <h4>${badge.name}</h4>
            <p>${badge.desc}</p>
        </div>
        <div class="ach-xp">${
          isUnlocked ? "CONQUISTADO" : `+${badge.xp} XP`
        }</div>
    `;

    list.appendChild(card);
  });
}

document.addEventListener("visibilitychange", () => {
  const video = document.getElementById("videoPlayer");
  // Se minimizou e o vídeo está tocando
  if (document.hidden && video && !video.paused) {
    video.pause();

    // Correção Bug #4: Reseta o tracker para não bugar o tempo quando voltar
    lastVideoTime = video.currentTime;

    document.title = "Ausente - Vídeo Pausado";
  }
});
