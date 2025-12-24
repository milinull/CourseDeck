const { ipcRenderer } = require('electron');
const path = require('path');

let currentCourses = [];
let activeCourseIndex = null;
let activeLessonIndex = null; 
let activeLessonPath = null;  
let saveTimeout = null; 

window.addEventListener('load', () => {
  const coursesData = localStorage.getItem('coursesData');
  const selectedFolder = localStorage.getItem('selectedFolder');
  
  if (!coursesData || !selectedFolder) {
    window.location.href = 'welcome.html';
    return;
  }
  
  const folderName = path.basename(selectedFolder);
  document.getElementById('courseTitle').innerText = folderName;
  
  currentCourses = JSON.parse(coursesData);
  displayCourses();
});

// --- FUNÇÃO PARA O DROPDOWN (ACORDEÃO DO HEADER - TRANSCRIÇÃO) ---
window.toggleSection = function(elementId, button) {
    const content = document.getElementById(elementId);
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        button.classList.add('active');
        const icon = button.querySelector('.arrow');
        if(icon) icon.className = 'fas fa-chevron-up arrow'; 
    } else {
        content.style.display = 'none';
        button.classList.remove('active');
        const icon = button.querySelector('.arrow');
        if(icon) icon.className = 'fas fa-chevron-down arrow';
    }
}

// --- NAVEGAÇÃO ENTRE VÍDEOS ---
window.prevLesson = function() {
    if (activeCourseIndex === null || activeLessonIndex === null) return;
    if (activeLessonIndex > 0) {
        loadContent(activeCourseIndex, activeLessonIndex - 1);
    }
}

window.nextLesson = function() {
    if (activeCourseIndex === null || activeLessonIndex === null) return;
    const course = currentCourses[activeCourseIndex];
    if (activeLessonIndex < course.lessons.length - 1) {
        loadContent(activeCourseIndex, activeLessonIndex + 1);
    }
}

// --- FUNÇÃO PRINCIPAL QUE DESENHA A SIDEBAR ---
// Substitua a função displayCourses inteira por esta:
function displayCourses() {
  const courseList = document.getElementById('courseList');
  courseList.innerHTML = '';

  if (currentCourses.length === 0) {
    courseList.innerHTML = `<div class="empty-state"><p>Nenhum conteúdo</p></div>`;
    return;
  }
  
  currentCourses.forEach((course, courseIndex) => {
    // Cálculos
    const total = course.lessons.length;
    const watchedCount = course.lessons.filter(l => l.watched).length;
    const percentage = total === 0 ? 0 : Math.round((watchedCount / total) * 100);
    const isOpen = courseIndex === activeCourseIndex;

    const courseElement = document.createElement('div');
    courseElement.className = `course-item ${isOpen ? 'open' : ''}`;
    
    // 1. Cabeçalho do Módulo
    let html = `
      <div class="course-header" onclick="toggleModule(${courseIndex})">
        <div class="course-title">
          <i class="fas ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size: 0.7rem; width: 10px;"></i>
          <span>${course.name}</span>
        </div>
        <span class="progress-text" style="font-size: 0.7rem;">${watchedCount}/${total}</span>
      </div>
      
      <div class="progress-container">
        <div class="progress-bar" style="width: ${percentage}%"></div>
      </div>
      
      <div class="lesson-container">
    `;

    // 2. MATERIAIS EXTRAS (LINKS .URL e ARQUIVOS .HTML)
    if (course.externalLinks && course.externalLinks.length > 0) {
        course.externalLinks.forEach(link => {
            // Verifica se é Link de Internet ou Arquivo Local
            const isUrl = link.url && link.url.startsWith('http');
            
            // Define o comando de clique: 'open-external-url' (Navegador) ou 'open-file-external' (Local)
            const clickAction = isUrl 
                ? `ipcRenderer.invoke('open-external-url', '${link.url}')`
                : `ipcRenderer.invoke('open-file-external', '${link.path.replace(/\\/g, '\\\\')}')`;
            
            // Ícone e Cor: Azul para Web, Laranja para Arquivo Local
            const iconClass = isUrl ? 'fa-external-link-alt' : 'fa-file-code';
            const iconColor = isUrl ? '#61dafb' : '#e34c26'; // Azul React ou Laranja HTML
            
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
        
        // Divisória sutil para separar os links das aulas
        html += `<div style="height: 1px; background: rgba(255,255,255,0.05); margin: 4px 16px;"></div>`;
    }

    // 3. AULAS DO MÓDULO
    course.lessons.forEach((lesson, lessonIndex) => {
        const isActive = (courseIndex === activeCourseIndex && lessonIndex === activeLessonIndex);
        const icon = lesson.type === 'video' ? 'fa-play-circle' : 'fa-file-alt';
        
        html += `
            <div class="sidebar-lesson ${isActive ? 'active' : ''} ${lesson.watched ? 'watched' : ''}" 
                 onclick="loadContent(${courseIndex}, ${lessonIndex})">
                
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1; min-width: 0;">
                    <i class="fas ${icon}" style="font-size: 0.8rem; flex-shrink: 0;"></i>
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${lesson.name}
                    </span>
                </div>

                <button class="sidebar-eye ${lesson.watched ? 'watched' : ''}" 
                        onclick="event.stopPropagation(); toggleWatched(${courseIndex}, ${lessonIndex})"
                        title="Marcar como visto">
                    <i class="fas ${lesson.watched ? 'fa-eye-slash' : 'fa-eye'}"></i>
                </button>
            </div>
        `;
    });

    html += `</div>`; // Fecha lesson-container
    
    courseElement.innerHTML = html;
    courseList.appendChild(courseElement);
  });
}

function toggleModule(index) {
    if (activeCourseIndex === index) {
        activeCourseIndex = null; // Fecha
    } else {
        activeCourseIndex = index; // Abre
    }
    displayCourses(); // Atualiza a sidebar
}

// --- CARREGAR CONTEÚDO (VÍDEO/TEXTO) ---
async function loadContent(courseIndex, lessonIndex) {
  const videoContainer = document.getElementById('videoContainer');
  const textContainer = document.getElementById('textContainer');
  const videoPlayer = document.getElementById('videoPlayer');
  const contentFrame = document.getElementById('contentFrame');
  const transcriptContainer = document.getElementById('transcriptContainer');
  
  // Atualiza índices globais
  activeCourseIndex = courseIndex; // Garante que o módulo fique aberto
  activeLessonIndex = lessonIndex; 
  
  const lesson = currentCourses[courseIndex].lessons[lessonIndex];
  activeLessonPath = lesson.path;

  // Atualiza visual da sidebar (marca a aula como ativa)
  displayCourses();

  // --- LÓGICA DAS NOTAS ---
  const noteInput = document.getElementById('userNoteInput');
  const saveStatus = document.getElementById('saveStatus');
  
  noteInput.value = '';
  saveStatus.innerText = 'Carregando...';
  
  const savedNote = await ipcRenderer.invoke('get-note', lesson.path);
  noteInput.value = savedNote || '';
  saveStatus.innerText = 'Pronto';

  noteInput.oninput = () => {
      saveStatus.innerText = 'Digitando...';
      saveStatus.style.color = '#e1e1e6';
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
          await ipcRenderer.invoke('save-note', lesson.path, noteInput.value);
          saveStatus.innerText = 'Salvo ✓';
          saveStatus.style.color = '#04d361';
      }, 1000);
  };

  try {
    const fileUrl = await ipcRenderer.invoke('get-video-url', lesson.path);

    if (lesson.type === 'video') {
        // MODO VÍDEO
        textContainer.style.display = 'none';
        videoContainer.style.display = 'block';
        contentFrame.src = ''; 

        videoPlayer.src = fileUrl;
        videoPlayer.innerHTML = ''; 

        // Recupera o tempo salvo (Retomar de onde parou)
        const savedTime = localStorage.getItem(`time_${lesson.path}`);
        
        videoPlayer.onloadedmetadata = () => {
            if (savedTime) {
                videoPlayer.currentTime = parseFloat(savedTime);
            }
        };

        videoPlayer.ontimeupdate = () => {
            localStorage.setItem(`time_${lesson.path}`, videoPlayer.currentTime);
        };

        // Legenda
        if (lesson.subtitle) {
            const subtitleUrl = await ipcRenderer.invoke('get-video-url', lesson.subtitle);
            
            const track = document.createElement('track');
            track.kind = 'subtitles'; track.label = 'Português'; track.srclang = 'pt';
            track.src = subtitleUrl; track.default = true;
            videoPlayer.appendChild(track);

            loadTranscriptText(subtitleUrl);
            transcriptContainer.style.display = 'block'; 
        } else {
            transcriptContainer.style.display = 'none'; 
        }

        videoPlayer.load();
        // try { videoPlayer.play(); } catch(e) {}

    } else {
        // MODO TEXTO (HTML)
        videoContainer.style.display = 'none';
        textContainer.style.display = 'flex'; 
        videoPlayer.pause();
        contentFrame.src = fileUrl;
    }

  } catch (error) {
    console.error("Erro ao carregar conteúdo", error);
    alert("Erro ao abrir arquivo.");
  }
}

async function loadTranscriptText(subtitleUrl) {
    try {
        const response = await fetch(subtitleUrl);
        const text = await response.text();
        const cleanText = text
            .replace(/WEBVTT/g, '') 
            .replace(/(\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}.*)/g, '') 
            .replace(/(\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}\.\d{3}.*)/g, '') 
            .replace(/NOTE.*/g, '') 
            .replace(/\n\s*\n/g, '\n'); 
        document.getElementById('transcriptText').innerText = cleanText;
    } catch (e) {
        document.getElementById('transcriptText').innerText = "Erro ao carregar transcrição.";
    }
}

async function toggleWatched(courseIndex, lessonIndex) {
  const lesson = currentCourses[courseIndex].lessons[lessonIndex];
  lesson.watched = !lesson.watched;
  
  await ipcRenderer.invoke('toggle-watched', lesson.path, lesson.watched);
  localStorage.setItem('coursesData', JSON.stringify(currentCourses));
  
  // Atualiza a sidebar (incluindo a barra de progresso)
  displayCourses();
}

// --- FUNÇÕES GLOBAIS DE UI ---

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('collapsed');
}

function toggleNotesSidebar() {
    const notesSidebar = document.querySelector('.notes-sidebar');
    notesSidebar.classList.toggle('collapsed');
}

function changeSpeed(select) {
    const video = document.getElementById('videoPlayer');
    if(video) video.playbackRate = parseFloat(select.value);
}

document.addEventListener('keydown', (e) => {
    const videoPlayer = document.getElementById('videoPlayer');
    if (document.getElementById('videoContainer').style.display === 'none') return;
    if (document.activeElement.id === 'userNoteInput') return; // Não atalhar se digitando nota
    if (document.activeElement.tagName === 'INPUT') return; // Não atalhar se digitando tempo pomodoro

    switch(e.code) {
        case 'Space':
            e.preventDefault(); 
            if (videoPlayer.paused) videoPlayer.play();
            else videoPlayer.pause();
            break;
        case 'ArrowRight':
            videoPlayer.currentTime += 5; 
            break;
        case 'ArrowLeft':
            videoPlayer.currentTime -= 5; 
            break;
    }
});

function filterLessons(searchTerm) {
    const term = searchTerm.toLowerCase();
    const courses = document.querySelectorAll('.course-item');
    
    courses.forEach(course => {
        const titleSpan = course.querySelector('.course-title span');
        if (titleSpan) {
            const title = titleSpan.innerText.toLowerCase();
            // Se o módulo bater com a busca, mostra ele. 
            // Melhoria: Poderíamos buscar nas aulas também, mas por enquanto busca módulos.
            if (title.includes(term)) {
                course.style.display = 'flex';
            } else {
                course.style.display = 'none';
            }
        }
    });
}

function toggleTheaterMode() {
    document.body.classList.toggle('theater-active');
}

document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 't' && 
        document.activeElement.tagName !== 'TEXTAREA' && 
        document.activeElement.tagName !== 'INPUT') {
        toggleTheaterMode();
    }
});

// --- POMODORO V3 (Com suporte a inputs) ---
let pomoInterval = null;
let isPomoRunning = false;
let currentMode = 'work'; // 'work' ou 'break'
let timeRemaining = 25 * 60; 

function updatePomoDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    
    const minInputId = currentMode === 'work' ? 'workMin' : 'breakMin';
    const secSpanId = currentMode === 'work' ? 'workSec' : 'breakSec';
    
    const minInput = document.getElementById(minInputId);
    const secSpan = document.getElementById(secSpanId);
    
    if (minInput && secSpan) {
        if (document.activeElement !== minInput) {
            minInput.value = minutes;
        }
        secSpan.innerText = seconds.toString().padStart(2, '0');
    }
    
    if (isPomoRunning) {
        document.title = `(${minutes}:${seconds.toString().padStart(2, '0')}) Course Manager`;
    } else {
        document.title = "Course Manager";
    }
}

function updatePomoSettings() {
    if (isPomoRunning) return; 

    let workInput = document.getElementById('workMin');
    let breakInput = document.getElementById('breakMin');

    let workVal = parseInt(workInput.value);
    if (isNaN(workVal) || workVal < 1) { workVal = 1; workInput.value = 1; }

    let breakVal = parseInt(breakInput.value);
    if (isNaN(breakVal) || breakVal < 1) { breakVal = 1; breakInput.value = 1; }
    
    if (currentMode === 'work') {
        timeRemaining = workVal * 60;
        document.getElementById('workSec').innerText = "00";
    } else {
        timeRemaining = breakVal * 60;
        document.getElementById('breakSec').innerText = "00";
    }
}

function setPomoMode(mode) {
    if (isPomoRunning && mode !== currentMode) {
        togglePomodoro(); 
    }
    
    currentMode = mode;
    
    document.getElementById('pomoWork').className = mode === 'work' ? 'timer-text active' : 'timer-text';
    document.getElementById('pomoBreak').className = mode === 'break' ? 'timer-text active' : 'timer-text';
    
    updatePomoSettings();
}

function togglePomodoro() {
    const btnIcon = document.querySelector('#pomoBtn i');
    const minInput = document.getElementById(currentMode === 'work' ? 'workMin' : 'breakMin');

    if (isPomoRunning) {
        clearInterval(pomoInterval);
        isPomoRunning = false;
        btnIcon.className = 'fas fa-play';
        minInput.disabled = false; 
    } else {
        isPomoRunning = true;
        btnIcon.className = 'fas fa-pause';
        minInput.disabled = true; 
        
        pomoInterval = setInterval(() => {
            if (timeRemaining > 0) {
                timeRemaining--;
                updatePomoDisplay();
            } else {
                clearInterval(pomoInterval);
                isPomoRunning = false;
                btnIcon.className = 'fas fa-play';
                minInput.disabled = false;
                
                alert(currentMode === 'work' ? "Foco finalizado! Hora da pausa." : "Pausa finalizada! De volta ao trabalho.");
                setPomoMode(currentMode === 'work' ? 'break' : 'work');
            }
        }, 1000);
    }
}

function resetPomodoro() {
    clearInterval(pomoInterval);
    isPomoRunning = false;
    document.querySelector('#pomoBtn i').className = 'fas fa-play';
    
    document.getElementById('workMin').disabled = false;
    document.getElementById('breakMin').disabled = false;
    
    updatePomoSettings();
    updatePomoDisplay();
}

// --- REDIMENSIONAMENTO DA SIDEBAR ---
const sidebar = document.querySelector('.sidebar');
const resizer = document.getElementById('resizer');

let isResizing = false;

if (resizer) {
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize'; // Força o cursor em toda a tela
        resizer.classList.add('resizing');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        // Evita que a seleção de texto atrapalhe
        e.preventDefault(); 
        
        // Calcula a nova largura baseada na posição X do mouse
        // Limitamos entre 200px (mínimo) e 600px (máximo) para não quebrar o layout
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 600) newWidth = 600;

        sidebar.style.width = `${newWidth}px`;
        // Atualiza a variável CSS caso queira usar em outros lugares, mas o style inline já basta
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            resizer.classList.remove('resizing');
        }
    });
}