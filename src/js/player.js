const { ipcRenderer } = require('electron');
const path = require('path');

let currentCourses = [];
let activeCourseIndex = null;
let activeLessonIndex = null; 
let activeLessonPath = null;  
let saveTimeout = null;

// Variáveis Globais Novas
let quill; // Instância do Editor de Texto
let transcriptSegments = []; // Dados de tempo da legenda

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

  // --- INICIALIZAÇÃO DO QUILL (EDITOR DE TEXTO) ---
  // Verifica se o elemento editor existe antes de criar (para evitar erros)
  if (document.getElementById('editor')) {
      quill = new Quill('#editor', {
          theme: 'snow',
          placeholder: 'Faça suas anotações aqui...',
          modules: {
              toolbar: [
                  ['bold', 'italic', 'underline', 'strike'], 
                  [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                  [{ 'color': [] }, { 'background': [] }],
                  ['clean']
              ]
          }
      });

      // Evento de salvamento automático do Quill
      quill.on('text-change', function(delta, oldDelta, source) {
          if (source === 'user') {
              const saveStatus = document.getElementById('saveStatus');
              saveStatus.innerText = 'Digitando...';
              saveStatus.style.color = '#e1e1e6';
              
              clearTimeout(saveTimeout);
              saveTimeout = setTimeout(async () => {
                  // Salva o HTML completo para manter cores e negrito
                  const htmlContent = quill.root.innerHTML;
                  await ipcRenderer.invoke('save-note', activeLessonPath, htmlContent);
                  saveStatus.innerText = 'Salvo ✓';
                  saveStatus.style.color = '#04d361';
              }, 1000);
          }
      });
  }
});

// --- NAVEGAÇÃO E DROPDOWN ---
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

// --- SIDEBAR ---
function displayCourses() {
  const courseList = document.getElementById('courseList');
  courseList.innerHTML = '';

  if (currentCourses.length === 0) {
    courseList.innerHTML = `<div class="empty-state"><p>Nenhum conteúdo</p></div>`;
    return;
  }
  
  currentCourses.forEach((course, courseIndex) => {
    const total = course.lessons.length;
    const watchedCount = course.lessons.filter(l => l.watched).length;
    const percentage = total === 0 ? 0 : Math.round((watchedCount / total) * 100);
    const isOpen = courseIndex === activeCourseIndex;

    const courseElement = document.createElement('div');
    courseElement.className = `course-item ${isOpen ? 'open' : ''}`;
    
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

    // Links Extras
    if (course.externalLinks && course.externalLinks.length > 0) {
        course.externalLinks.forEach(link => {
            const isUrl = link.url && link.url.startsWith('http');
            const clickAction = isUrl 
                ? `ipcRenderer.invoke('open-external-url', '${link.url}')`
                : `ipcRenderer.invoke('open-file-external', '${link.path.replace(/\\/g, '\\\\')}')`;
            
            const iconClass = isUrl ? 'fa-external-link-alt' : 'fa-file-code';
            const iconColor = isUrl ? '#61dafb' : '#e34c26'; 
            
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
  const videoContainer = document.getElementById('videoContainer');
  const textContainer = document.getElementById('textContainer');
  const videoPlayer = document.getElementById('videoPlayer');
  const contentFrame = document.getElementById('contentFrame');
  const transcriptContainer = document.getElementById('transcriptContainer');
  const saveStatus = document.getElementById('saveStatus');

  activeCourseIndex = courseIndex;
  activeLessonIndex = lessonIndex;
  const lesson = currentCourses[courseIndex].lessons[lessonIndex];
  activeLessonPath = lesson.path;

  displayCourses();

  // -- CARREGAR NOTAS (Versão Quill) --
  if (saveStatus) saveStatus.innerText = 'Carregando nota...';
  
  try {
      const savedNote = await ipcRenderer.invoke('get-note', lesson.path);
      if (quill) {
          // Define o conteúdo HTML do editor
          quill.root.innerHTML = savedNote || '';
          // Limpa o histórico de undo/redo ao carregar nova nota
          quill.history.clear(); 
      }
      if (saveStatus) saveStatus.innerText = 'Pronto';
  } catch (err) {
      console.error("Erro ao carregar nota:", err);
  }

  // -- CARREGAR MÍDIA --
  try {
    const fileUrl = await ipcRenderer.invoke('get-video-url', lesson.path);
    
    if (lesson.type === 'video') {
        // MODO VÍDEO
        textContainer.style.display = 'none';
        videoContainer.style.display = 'block';
        contentFrame.src = ''; 

        videoPlayer.src = fileUrl;
        
        // Remove legendas anteriores para evitar duplicação
        videoPlayer.innerHTML = ''; 

        // Recupera tempo salvo
        const savedTime = localStorage.getItem(`time_${lesson.path}`);
        
        // Configuração inicial do vídeo
        videoPlayer.onloadedmetadata = () => {
            if (savedTime) {
                videoPlayer.currentTime = parseFloat(savedTime);
            }
        };

        // --- AQUI A MÁGICA DA SINCRONIA ---
        videoPlayer.ontimeupdate = () => {
            // 1. Salva tempo
            localStorage.setItem(`time_${lesson.path}`, videoPlayer.currentTime);
            // 2. Sincroniza legenda
            highlightTranscript(videoPlayer.currentTime);
        };

        // Carrega Legenda e Transcrição
        if (lesson.subtitle) {
            const subtitleUrl = await ipcRenderer.invoke('get-video-url', lesson.subtitle);
            
            // Cria a track para o player (CC nativo)
            const track = document.createElement('track');
            track.kind = 'subtitles'; 
            track.label = 'Português'; 
            track.srclang = 'pt';
            track.src = subtitleUrl; 
            track.default = true;
            videoPlayer.appendChild(track);
            
            // Gera a transcrição clicável e sincronizada
            loadTranscriptText(subtitleUrl);
            transcriptContainer.style.display = 'block'; 
            
            // Reseta botão de legenda se existir
            const btnCaptions = document.getElementById('btnCaptions');
            if(btnCaptions) {
                btnCaptions.classList.add('active'); // Assume ligado por padrão pq track.default = true
                btnCaptions.style.color = 'var(--success)';
            }

        } else {
            transcriptContainer.style.display = 'none';
        }

        videoPlayer.load();
        
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

// --- LÓGICA DE TRANSCRIÇÃO INTELIGENTE ---
async function loadTranscriptText(subtitleUrl) {
    const container = document.getElementById('transcriptText');
    container.innerHTML = 'Carregando...';
    transcriptSegments = []; // Limpa cache de tempos

    try {
        const response = await fetch(subtitleUrl);
        const text = await response.text();
        
        // Parse manual do VTT
        const lines = text.split('\n');
        let html = '';
        let currentStart = null;
        let currentEnd = null;
        let currentText = [];

        lines.forEach(line => {
            line = line.trim();
            if (line.includes('-->')) {
                // Salva bloco anterior
                if (currentStart !== null && currentText.length > 0) {
                    addSegment(currentStart, currentEnd, currentText.join(' '));
                }
                // Novos tempos
                const parts = line.split('-->');
                currentStart = timeToSeconds(parts[0].trim());
                currentEnd = timeToSeconds(parts[1].trim());
                currentText = [];
            } else if (line !== '' && !line.startsWith('WEBVTT') && !line.startsWith('NOTE') && isNaN(line)) {
                // Texto da legenda
                currentText.push(line);
            }
        });
        
        // Salva último bloco
        if (currentStart !== null && currentText.length > 0) {
            addSegment(currentStart, currentEnd, currentText.join(' '));
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
    const parts = timeString.split(':');
    let seconds = 0;
    if (parts.length === 3) {
        seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
        seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return seconds;
}

// Pula vídeo para o tempo clicado
window.seekTo = function(seconds) {
    const video = document.getElementById('videoPlayer');
    if(video) {
        video.currentTime = seconds;
        video.play();
    }
}

// Destaca texto conforme o vídeo toca
function highlightTranscript(currentTime) {
    // Busca todas as linhas (caso não tenhamos cacheado os elementos DOM, fazemos querySelector)
    // Para performance em arquivos gigantes, ideal seria cachear, mas aqui funciona bem.
    const lines = document.querySelectorAll('.transcript-line');
    
    // Otimização: Só roda se o container estiver visível
    const container = document.getElementById('transcriptContainer');
    if (container.style.display === 'none') return;

    lines.forEach(line => {
        const start = parseFloat(line.getAttribute('data-start'));
        const end = parseFloat(line.getAttribute('data-end'));
        
        if (currentTime >= start && currentTime <= end) {
            if (!line.classList.contains('active')) {
                // Remove anterior
                const active = document.querySelector('.transcript-line.active');
                if (active) active.classList.remove('active');
                
                // Adiciona novo
                line.classList.add('active');
                
                // Scroll automático suave
                line.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });
}

// --- BOTÃO DE LIGAR/DESLIGAR LEGENDA ---
window.toggleCaptions = function() {
    const video = document.getElementById('videoPlayer');
    const btn = document.getElementById('btnCaptions');
    
    if (!video.textTracks || video.textTracks.length === 0) {
        alert("Nenhuma legenda disponível.");
        return;
    }

    const track = video.textTracks[0];
    
    if (track.mode === 'showing') {
        track.mode = 'hidden';
        if(btn) {
            btn.classList.remove('active');
            btn.style.color = 'var(--text-secondary)';
        }
    } else {
        track.mode = 'showing';
        if(btn) {
            btn.classList.add('active');
            btn.style.color = 'var(--success)';
        }
    }
}

// --- FUNÇÕES GERAIS ---

async function toggleWatched(courseIndex, lessonIndex) {
  const lesson = currentCourses[courseIndex].lessons[lessonIndex];
  lesson.watched = !lesson.watched;
  
  await ipcRenderer.invoke('toggle-watched', lesson.path, lesson.watched);
  localStorage.setItem('coursesData', JSON.stringify(currentCourses));
  displayCourses();
}

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

// Atalhos de Teclado
document.addEventListener('keydown', (e) => {
    const videoPlayer = document.getElementById('videoPlayer');
    
    // Ignora se estiver digitando no Quill ou Input
    if (document.querySelector('.ql-editor') && document.querySelector('.ql-editor').contains(document.activeElement)) return; 
    if (document.activeElement.tagName === 'INPUT') return; 

    if (document.getElementById('videoContainer').style.display === 'none') return;

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
    
    // Atalho T para Theater Mode
    if (e.key.toLowerCase() === 't') {
        toggleTheaterMode();
    }
});

function filterLessons(searchTerm) {
    const term = searchTerm.toLowerCase();
    const courses = document.querySelectorAll('.course-item');
    courses.forEach(course => {
        const titleSpan = course.querySelector('.course-title span');
        if (titleSpan) {
            const title = titleSpan.innerText.toLowerCase();
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

// --- POMODORO ---
let pomoInterval = null;
let isPomoRunning = false;
let currentMode = 'work';
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
        document.body.style.cursor = 'col-resize';
        resizer.classList.add('resizing');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        e.preventDefault(); 
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 600) newWidth = 600;
        sidebar.style.width = `${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            resizer.classList.remove('resizing');
        }
    });
}