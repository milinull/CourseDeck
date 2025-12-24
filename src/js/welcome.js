const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Caminho do arquivo onde salvaremos o histórico (na sua pasta de usuário)
const historyFile = path.join(os.homedir(), '.course_manager_recents.json');

// --- Funções de Histórico ---

function getRecentFolders() {
  try {
    if (fs.existsSync(historyFile)) {
      const data = fs.readFileSync(historyFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Erro ao ler histórico:', error);
  }
  return [];
}

function addToRecent(folderPath) {
  let recent = getRecentFolders();
  
  // Remove se já existir (para colocar no topo novamente)
  recent = recent.filter(p => p !== folderPath);
  
  // Adiciona no início da lista
  recent.unshift(folderPath);
  
  // Mantém apenas os últimos 5
  if (recent.length > 5) recent.pop();
  
  try {
    fs.writeFileSync(historyFile, JSON.stringify(recent));
  } catch (error) {
    console.error('Erro ao salvar histórico:', error);
  }
}

// --- Funções de Carregamento ---

async function loadCourseFromPath(folderPath) {
  if (!folderPath) return;

  const loadingEl = document.getElementById('loading');
  const recentsEl = document.getElementById('recentFoldersArea');

  if (loadingEl) loadingEl.style.display = 'block';
  if (recentsEl) recentsEl.style.display = 'none';

  try {
    const courses = await ipcRenderer.invoke('read-folder', folderPath);
    
    // Salva dados da sessão atual
    localStorage.setItem('coursesData', JSON.stringify(courses));
    localStorage.setItem('selectedFolder', folderPath);
    
    // Atualiza o histórico persistente
    addToRecent(folderPath);
    
    window.location.href = 'player.html';
  } catch (error) {
    console.error(error);
    alert('Erro ao carregar a pasta. Verifique se ela ainda existe.');
    if (loadingEl) loadingEl.style.display = 'none';
    if (recentsEl) renderRecents(); // Re-exibe a lista se der erro
  }
}

function renderRecents() {
  const recentPaths = getRecentFolders();
  const container = document.getElementById('recentFoldersArea');
  const list = document.getElementById('recentList');
  
  // Se não tiver container (caso o HTML não tenha sido salvo), aborta
  if (!container || !list) return;

  if (recentPaths.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  list.innerHTML = '';

  recentPaths.forEach(folderPath => {
    const btn = document.createElement('button');
    
    // Pega apenas o nome final da pasta (ex: "Curso Python" de "/home/user/Curso Python")
    const folderName = path.basename(folderPath);

    // Estilização direta no JS para facilitar
    btn.className = 'select-folder-btn'; 
    btn.style.backgroundColor = '#202024'; 
    btn.style.border = '1px solid #323238';
    btn.style.fontSize = '0.9rem';
    btn.style.padding = '0.6rem 1rem';
    btn.style.width = '100%'; // Ocupa largura total disponível
    btn.style.justifyContent = 'flex-start'; // Alinha texto à esquerda
    
    // Ícone de histórico + Nome da pasta
    btn.innerHTML = `<i class="fas fa-history" style="color: #7c3aed; margin-right: 8px;"></i> ${folderName}`;
    
    // Adiciona dica de ferramenta (tooltip) com o caminho completo ao passar o mouse
    btn.title = folderPath;
    
    btn.onclick = () => loadCourseFromPath(folderPath);
    
    // Efeito Hover simples
    btn.onmouseenter = () => btn.style.borderColor = '#7c3aed';
    btn.onmouseleave = () => btn.style.borderColor = '#323238';

    list.appendChild(btn);
  });
}

// --- Inicialização ---

window.addEventListener('load', renderRecents);

document.getElementById('selectFolder').addEventListener('click', async () => {
  const folderPath = await ipcRenderer.invoke('select-folder');
  if (folderPath) {
    loadCourseFromPath(folderPath);
  }
});